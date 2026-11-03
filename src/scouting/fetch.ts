import { replaySan } from '../chess/position'
import { chesscomArchivesUrl, normalizeChesscom, type ChesscomGame } from '../import/chesscom'
import { lichessGamesUrl, normalizeLichess, readNdjson, type LichessGame } from '../import/lichess'
import { fetchOk } from '../import/sync'
import type { Game, ImportedGame, Site } from '../import/types'
import { classify } from '../openings/classify'
import type { OpeningMap } from '../openings/types'

/** Games fetched for a scouting report: enough to see habits, quick to download. */
export const SCOUT_GAMES = 200
/** Chess.com archives are monthly: at most this many recent months. */
const SCOUT_MONTHS = 4

/**
 * Downloads a player's recent games (seen from their side) without storing them, and
 * names their openings.
 */
export async function fetchScoutGames(
  site: Site,
  username: string,
  opts: { openings: OpeningMap; fetch?: typeof fetch; signal?: AbortSignal },
): Promise<Game[]> {
  const items: ImportedGame[] = []
  const http = { fetch: opts.fetch, signal: opts.signal }
  if (site === 'lichess') {
    const url = `${lichessGamesUrl(username)}&max=${SCOUT_GAMES}`
    const res = await fetchOk(url, http, { headers: { Accept: 'application/x-ndjson' } })
    if (!res.body) throw new Error('Risposta vuota da lichess.org')
    for await (const raw of readNdjson<LichessGame>(res.body)) {
      const item = normalizeLichess(raw, username)
      if (item) items.push(item)
    }
  } else {
    const res = await fetchOk(chesscomArchivesUrl(username), http)
    const { archives } = (await res.json()) as { archives: string[] }
    // Newest months first, one request at a time (Chess.com rejects parallel ones).
    for (const url of archives.slice(-SCOUT_MONTHS).reverse()) {
      if (items.length >= SCOUT_GAMES) break
      const page = (await (await fetchOk(url, http)).json()) as { games: ChesscomGame[] }
      for (const g of page.games.reverse()) {
        const item = normalizeChesscom(g, username)
        if (item) items.push(item)
      }
    }
  }
  return items.slice(0, SCOUT_GAMES).map(({ game }) => {
    try {
      const opening = classify(replaySan(game.moves).epds, opts.openings)
      return opening
        ? { ...game, eco: opening.eco, openingName: opening.name, openingPly: opening.ply }
        : game
    } catch {
      return game
    }
  })
}
