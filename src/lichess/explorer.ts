import type { ChessDb } from '../db/schema'
import { cached, lichessGet, NeedsTokenError, SerialQueue, type HttpDeps } from './cache'

export type ExplorerDb = 'lichess' | 'masters'

export interface ExplorerMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  averageRating?: number
}

export interface ExplorerResult {
  white: number
  draws: number
  black: number
  moves: ExplorerMove[]
  opening?: { eco: string; name: string } | null
}

export interface ExplorerParams {
  /** Lichess speeds, e.g. ["blitz", "rapid"]. */
  speeds: string[]
  /** Rating buckets, e.g. [1200, 1400, 1600]. */
  ratings: number[]
}

export const RATING_BUCKETS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]
export const DEFAULT_EXPLORER: ExplorerParams = {
  speeds: ['blitz', 'rapid'],
  ratings: [1200, 1400, 1600],
}

const DAY = 24 * 60 * 60 * 1000
const MAX_AGE: Record<ExplorerDb, number> = { lichess: 30 * DAY, masters: 365 * DAY }

export function explorerUrl(db: ExplorerDb, epd: string, params: ExplorerParams): string {
  const q = new URLSearchParams({ fen: `${epd} 0 1`, moves: '20', topGames: '0', recentGames: '0' })
  if (db === 'lichess') {
    q.set('speeds', params.speeds.join(','))
    q.set('ratings', params.ratings.join(','))
  }
  return `https://explorer.lichess.org/${db}?${q}`
}

export function totalGames(r: { white: number; draws: number; black: number }): number {
  return r.white + r.draws + r.black
}

export interface ExplorerDeps extends HttpDeps {
  db: ChessDb
  getToken: () => Promise<string | undefined>
}

/** Explorer client: IndexedDB cache, one request at a time, needs a Lichess token. */
export class ExplorerClient {
  private queue = new SerialQueue()
  constructor(private deps: ExplorerDeps) {}

  /** Cached result only, without network (used by the coverage). */
  async peek(
    db: ExplorerDb,
    epd: string,
    params: ExplorerParams,
  ): Promise<ExplorerResult | undefined> {
    const hit = await this.deps.db.explorerCache.get(explorerUrl(db, epd, params))
    return (hit?.value as ExplorerResult | null) ?? undefined
  }

  get(db: ExplorerDb, epd: string, params: ExplorerParams): Promise<ExplorerResult> {
    const url = explorerUrl(db, epd, params)
    return cached<ExplorerResult>(this.deps.db.explorerCache, url, MAX_AGE[db], () =>
      this.queue.run(async () => {
        const token = await this.deps.getToken()
        if (!token) throw new NeedsTokenError()
        const res = await lichessGet(url, this.deps, { Authorization: `Bearer ${token}` })
        if (res.status === 401) throw new NeedsTokenError()
        if (!res.ok) throw new Error(`Explorer: errore ${res.status}`)
        return (await res.json()) as ExplorerResult
      }),
    ) as Promise<ExplorerResult>
  }
}
