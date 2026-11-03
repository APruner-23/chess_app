import type { Game } from '../import/types'

/** Games shorter than this teach nothing (early resignations, aborts). */
export const MIN_PLIES = 10

const DAY = 24 * 60 * 60 * 1000
/** Recency bands, newest first: within a band, losses come before draws and wins. */
const BANDS = [30, 90, 365, Infinity]
const RESULT_RANK = { loss: 0, draw: 1, win: 2 } as const

/**
 * The order in which to analyze games in the background: the most useful first.
 * Recent games before old ones (by band), and inside a band losses first (they hold
 * the mistakes that matter), then the newest.
 */
export function analysisOrder(
  games: readonly Game[],
  analyzed: ReadonlySet<string>,
  now: number,
): Game[] {
  const band = (g: Game) => BANDS.findIndex((d) => now - g.playedAt < d * DAY)
  return games
    .filter((g) => !analyzed.has(g.id) && g.moves.length >= MIN_PLIES)
    .sort(
      (a, b) =>
        band(a) - band(b) ||
        RESULT_RANK[a.result] - RESULT_RANK[b.result] ||
        b.playedAt - a.playedAt,
    )
}

/** Estimated time left, from the average time per game so far. */
export function etaMs(done: number, elapsedMs: number, remaining: number): number | undefined {
  return done > 0 ? (elapsedMs / done) * remaining : undefined
}
