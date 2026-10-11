import type { ChessDb } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { replaySan } from '../chess/position'
import { gamePositions } from '../import/positions'
import type { Game } from '../import/types'
import { TOKEN_KEY } from '../lichess/oauth'

/** User data kept in sync. Caches and indexes are rebuilt on each device. */
export const SYNC_TABLES = [
  'accounts',
  'games',
  'analyses',
  'repertoires',
  'repMoves',
  'cards',
  'reviewLogs',
  'feedback',
  'settings',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export const SYNC_KEY_SETTING = 'syncKey'
export const SYNC_STATE_SETTING = 'syncState'
/** Settings that never leave the device. */
export const DEVICE_SETTINGS = new Set([TOKEN_KEY, SYNC_KEY_SETTING, SYNC_STATE_SETTING])

export interface SyncState {
  /** Server sequence number already pulled. */
  cursor: number
  /** Local changes up to this updatedAt have been sent. */
  pushedUpTo: number
  lastSyncAt?: number
}

export interface Change {
  tbl: string
  id: string
  updatedAt: number
  deleted?: boolean
  data: Record<string, unknown> | null
}

interface PullPage {
  changes: Change[]
  cursor: number
  more: boolean
}

type Row = Record<string, unknown> & { updatedAt?: number }

const keyOf = (tbl: string, row: Row) => String(tbl === 'settings' ? row.key : row.id)

/**
 * Feedback is mostly derived from games and repertoires and recomputed on each device;
 * only the user's decisions travel. Device-only settings never do.
 */
function travels(tbl: string, row: Row): boolean {
  if (tbl === 'settings') return !DEVICE_SETTINGS.has(String(row.key))
  if (tbl === 'feedback') return row.status === 'done' || row.status === 'ignored'
  return true
}

/** Requests stay well under the server's limits (body size, CPU). */
const CHUNK_ITEMS = 150
const CHUNK_BYTES = 400_000

function chunks(changes: Change[]): Change[][] {
  const out: Change[][] = []
  let current: Change[] = []
  let bytes = 0
  for (const c of changes) {
    const size = JSON.stringify(c).length
    if (current.length && (current.length >= CHUNK_ITEMS || bytes + size > CHUNK_BYTES)) {
      out.push(current)
      current = []
      bytes = 0
    }
    current.push(c)
    bytes += size
  }
  if (current.length) out.push(current)
  return out
}

async function localChanges(db: ChessDb, after: number, skip: Set<string>): Promise<Change[]> {
  const changes: Change[] = []
  for (const tbl of SYNC_TABLES) {
    const rows = (await db
      .table(tbl)
      .filter((r: Row) => (r.updatedAt ?? 0) > after)
      .toArray()) as Row[]
    for (const row of rows) {
      const id = keyOf(tbl, row)
      if (!travels(tbl, row) || skip.has(`${tbl}|${id}|${row.updatedAt}`)) continue
      changes.push({ tbl, id, updatedAt: row.updatedAt!, data: row })
    }
  }
  for (const t of await db.tombstones.filter((t) => t.updatedAt > after).toArray()) {
    if (skip.has(`${t.tbl}|${t.id}|${t.updatedAt}`)) continue
    changes.push({ tbl: t.tbl, id: t.id, updatedAt: t.updatedAt, deleted: true, data: null })
  }
  return changes
}

/** Applies pulled changes: a remote copy wins only if newer than the local one. */
async function applyChanges(db: ChessDb, changes: Change[]): Promise<number> {
  let applied = 0
  const byTable = new Map<string, Change[]>()
  for (const c of changes) {
    if (!(SYNC_TABLES as readonly string[]).includes(c.tbl)) continue
    byTable.set(c.tbl, [...(byTable.get(c.tbl) ?? []), c])
  }
  const tables = [...byTable.keys()].map((t) => db.table(t))
  await db.transaction('rw', [...tables, db.gamePositions, db.tombstones], async () => {
    for (const [tbl, list] of byTable) {
      const table = db.table(tbl)
      const local = (await table.bulkGet(list.map((c) => c.id))) as (Row | undefined)[]
      const puts: Row[] = []
      const deletes: string[] = []
      list.forEach((c, i) => {
        const mine = local[i]
        if (mine && (mine.updatedAt ?? 0) >= c.updatedAt) return
        if (c.deleted) {
          if (mine) deletes.push(c.id)
        } else if (c.data && !(tbl === 'settings' && DEVICE_SETTINGS.has(c.id))) {
          puts.push(c.data)
        }
      })
      if (puts.length) await table.bulkPut(puts)
      if (deletes.length) {
        await table.bulkDelete(deletes)
        if (tbl === 'games') {
          for (const id of deletes) await db.gamePositions.where('gameId').equals(id).delete()
        }
      }
      applied += puts.length + deletes.length
      if (tbl === 'games') {
        for (const game of puts as unknown as Game[]) {
          try {
            await db.gamePositions.bulkPut(gamePositions(game, replaySan(game.moves).epds))
          } catch {
            // corrupt move list: keep the game without its position index
          }
        }
      }
    }
  })
  return applied
}

export interface SyncOptions {
  key: string
  fetch?: typeof fetch
  /** Server origin; empty means the app's own origin. */
  baseUrl?: string
  now?: () => number
}

export interface SyncResult {
  pushed: number
  pulled: number
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

/**
 * Sends local changes and pulls remote ones, page by page. Last write wins per record
 * (by updatedAt). Safe to call repeatedly; callers must not run two at once.
 */
export async function syncNow(db: ChessDb, opts: SyncOptions): Promise<SyncResult> {
  const doFetch = opts.fetch ?? fetch
  const now = opts.now ?? Date.now
  const startedAt = now()
  const state = await getSetting<SyncState>(db, SYNC_STATE_SETTING, { cursor: 0, pushedUpTo: 0 })
  const seen = new Set<string>()
  let { cursor } = state
  let maxSeen = state.pushedUpTo
  let pushed = 0
  let pulled = 0

  const roundTrip = async (batch: Change[]) => {
    const res = await doFetch(`${opts.baseUrl ?? ''}/api/sync?since=${cursor}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as { error?: string }
      throw new SyncError(error.error ?? `Errore ${res.status} dal server`, res.status)
    }
    const page = (await res.json()) as PullPage
    pushed += batch.length
    for (const c of batch) seen.add(`${c.tbl}|${c.id}|${c.updatedAt}`)
    pulled += await applyChanges(db, page.changes)
    for (const c of page.changes) {
      seen.add(`${c.tbl}|${c.id}|${c.updatedAt}`)
      maxSeen = Math.max(maxSeen, c.updatedAt)
    }
    cursor = page.cursor
    return page.more
  }

  // Push local changes (each request also brings back a page of remote ones),
  // then keep pulling until the server has nothing more.
  let pending = await localChanges(db, state.pushedUpTo, seen)
  for (;;) {
    for (const c of pending) maxSeen = Math.max(maxSeen, c.updatedAt)
    let more = true
    for (const batch of chunks(pending)) more = await roundTrip(batch)
    while (more) more = await roundTrip([])
    // Anything written locally while syncing (and not just pulled) goes out now.
    pending = await localChanges(db, state.pushedUpTo, seen)
    if (pending.length === 0) break
  }

  await setSetting<SyncState>(db, SYNC_STATE_SETTING, {
    cursor,
    // Never past the start of this sync: a local write landing during the last
    // round trip must still go out next time. Pulled records newer than that
    // are echoed once and ignored by the server (same updatedAt).
    pushedUpTo: Math.min(maxSeen, startedAt),
    lastSyncAt: now(),
  })
  return { pushed, pulled }
}
