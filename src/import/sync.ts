import type { Account, ChessDb, GamePosition } from '../db/schema'
import { replaySan } from '../chess/position'
import { classify } from '../openings/classify'
import type { OpeningMap } from '../openings/types'
import {
  archiveMonth,
  chesscomArchivesUrl,
  monthOf,
  normalizeChesscom,
  type ChesscomGame,
} from './chesscom'
import { lichessGamesUrl, normalizeLichess, readNdjson, type LichessGame } from './lichess'
import { gamePositions } from './positions'
import type { Analysis, Game, ImportedGame, Site } from './types'

export interface ImportProgress {
  site: Site
  /** Games saved so far in this run. */
  saved: number
  /** Human-readable step, in Italian. */
  step: string
}

export interface ImportOptions {
  db: ChessDb
  openings: OpeningMap
  fetch?: typeof fetch
  /** Lower bound for the first import (ms); undefined imports everything. */
  since?: number
  onProgress?: (p: ImportProgress) => void
  signal?: AbortSignal
  /** Waits between retries; injectable so tests don't sleep. */
  sleep?: (ms: number) => Promise<void>
}

const BATCH = 100
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Classifies, indexes and stores games. Ids are deterministic, so re-imports overwrite. */
export async function saveGames(
  db: ChessDb,
  items: ImportedGame[],
  openings: OpeningMap,
): Promise<number> {
  const games: Game[] = []
  const analyses: Analysis[] = []
  const positions: GamePosition[] = []
  for (const { game, analysis } of items) {
    let epds: string[]
    try {
      epds = replaySan(game.moves).epds
    } catch {
      continue // corrupt move list: skip the game rather than abort the import
    }
    const opening = classify(epds, openings)
    if (opening) {
      game.eco = opening.eco
      game.openingName = opening.name
      game.openingPly = opening.ply
    }
    games.push(game)
    if (analysis) analyses.push(analysis)
    positions.push(...gamePositions(game, epds))
  }
  await db.transaction('rw', db.games, db.analyses, db.gamePositions, async () => {
    await db.games.bulkPut(games)
    if (analyses.length) await db.analyses.bulkPut(analyses)
    await db.gamePositions.bulkPut(positions)
  })
  return games.length
}

async function fetchOk(url: string, opts: ImportOptions, init?: RequestInit): Promise<Response> {
  const doFetch = opts.fetch ?? fetch
  const sleep = opts.sleep ?? defaultSleep
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(url, { ...init, signal: opts.signal })
    if (res.ok) return res
    if (res.status === 429 && attempt < 2) {
      await sleep(60_000)
      continue
    }
    if (res.status === 404) throw new Error(`Utente non trovato (${url})`)
    throw new Error(`Errore ${res.status} da ${new URL(url).host}`)
  }
}

async function finishAccount(db: ChessDb, account: Account, cursor: number | string | undefined) {
  const now = Date.now()
  await db.accounts.put({ ...account, cursor, lastImportAt: now, updatedAt: now })
}

/** Streams the user's Lichess games newer than the account cursor. */
export async function importLichess(account: Account, opts: ImportOptions): Promise<number> {
  const since = typeof account.cursor === 'number' ? account.cursor : opts.since
  const res = await fetchOk(lichessGamesUrl(account.username, since), opts, {
    headers: { Accept: 'application/x-ndjson' },
  })
  if (!res.body) throw new Error('Risposta vuota da lichess.org')
  let cursor = typeof account.cursor === 'number' ? account.cursor : undefined
  let saved = 0
  let batch: ImportedGame[] = []
  const flush = async () => {
    saved += await saveGames(opts.db, batch, opts.openings)
    batch = []
    opts.onProgress?.({ site: 'lichess', saved, step: `${saved} partite salvate` })
  }
  for await (const raw of readNdjson<LichessGame>(res.body)) {
    cursor = Math.max(cursor ?? 0, raw.createdAt + 1)
    const item = normalizeLichess(raw, account.username)
    if (item) batch.push(item)
    if (batch.length >= BATCH) await flush()
  }
  await flush()
  await finishAccount(opts.db, account, cursor)
  return saved
}

/** Fetches Chess.com monthly archives strictly one at a time, from the cursor month on. */
export async function importChesscom(account: Account, opts: ImportOptions): Promise<number> {
  const res = await fetchOk(chesscomArchivesUrl(account.username), opts)
  const { archives } = (await res.json()) as { archives: string[] }
  const from =
    typeof account.cursor === 'string'
      ? account.cursor
      : opts.since !== undefined
        ? monthOf(opts.since)
        : ''
  // The cursor month is re-fetched on purpose: archives lag a few hours.
  const todo = archives.filter((url) => archiveMonth(url) >= from)
  let saved = 0
  let cursor = typeof account.cursor === 'string' ? account.cursor : undefined
  for (const [i, url] of todo.entries()) {
    const month = archiveMonth(url)
    opts.onProgress?.({
      site: 'chesscom',
      saved,
      step: `Mese ${month} (${i + 1}/${todo.length})`,
    })
    const page = (await (await fetchOk(url, opts)).json()) as { games: ChesscomGame[] }
    const items = page.games
      .filter((g) => opts.since === undefined || g.end_time * 1000 >= opts.since)
      .map((g) => normalizeChesscom(g, account.username))
      .filter((g): g is ImportedGame => g !== undefined)
    saved += await saveGames(opts.db, items, opts.openings)
    cursor = month
  }
  opts.onProgress?.({ site: 'chesscom', saved, step: `${saved} partite salvate` })
  await finishAccount(opts.db, account, cursor)
  return saved
}

export function importAccount(account: Account, opts: ImportOptions): Promise<number> {
  return account.id === 'lichess' ? importLichess(account, opts) : importChesscom(account, opts)
}
