import { gameAccuracy } from '../analysis/accuracy'
import { ceiledCp } from '../analysis/winPercent'
import type { Analysis, Color, Eval, Game, Site, Speed } from '../import/types'
import type { Repertoire } from '../repertoire/types'
import type { FeedbackItem } from './types'

/** Eval in pawns from the user's point of view, clamped to ±10. */
export function userPawns(e: Eval, color: Color): number {
  const cp = ceiledCp(e) / 100
  return color === 'white' ? cp : -cp
}

export interface Aggregate {
  games: number
  wins: number
  draws: number
  losses: number
  /** Points per game, %. */
  score: number
  /** Average eval at the book exit (user's view, pawns) over analyzed games. */
  avgExit?: number
  avgBookMoves: number
}

function aggregate(items: readonly FeedbackItem[], colorOf: (f: FeedbackItem) => Color): Aggregate {
  const wins = items.filter((f) => f.result === 'win').length
  const draws = items.filter((f) => f.result === 'draw').length
  const evals = items.filter((f) => f.exitEval).map((f) => userPawns(f.exitEval!, colorOf(f)))
  return {
    games: items.length,
    wins,
    draws,
    losses: items.length - wins - draws,
    score: items.length ? Math.round(((wins + draws / 2) / items.length) * 1000) / 10 : 0,
    ...(evals.length ? { avgExit: evals.reduce((a, b) => a + b, 0) / evals.length } : {}),
    avgBookMoves: items.length ? items.reduce((a, f) => a + f.bookPlies, 0) / items.length / 2 : 0,
  }
}

/** A game counts for a line only if it followed the repertoire for a move on each side. */
export const MIN_BOOK_PLIES = 2
const followed = (exits: readonly FeedbackItem[]) =>
  exits.filter((f) => f.bookPlies >= MIN_BOOK_PLIES)

export interface LineStats extends Aggregate {
  repertoireId: string
  /** Opening (variation) name of the games in this line. */
  name: string
}

/** Per repertoire and opening variation, from the "exit" items. Most played first. */
export function lineStats(
  exits: readonly FeedbackItem[],
  games: ReadonlyMap<string, Game>,
  reps: ReadonlyMap<string, Repertoire>,
): LineStats[] {
  const groups = new Map<string, FeedbackItem[]>()
  for (const f of followed(exits)) {
    const name = games.get(f.gameId)?.openingName ?? 'Sconosciuta'
    const key = `${f.repertoireId}|${name}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const [repertoireId, ...rest] = key.split('|')
      const color = reps.get(repertoireId!)?.color ?? 'white'
      return { repertoireId: repertoireId!, name: rest.join('|'), ...aggregate(items, () => color) }
    })
    .sort((a, b) => b.games - a.games)
}

/** Experimental vs main repertoires. */
export function experimentalVsMain(
  exits: readonly FeedbackItem[],
  reps: ReadonlyMap<string, Repertoire>,
): { experimental: Aggregate; main: Aggregate } {
  const colorOf = (f: FeedbackItem) => reps.get(f.repertoireId)?.color ?? 'white'
  exits = followed(exits)
  return {
    experimental: aggregate(
      exits.filter((f) => reps.get(f.repertoireId)?.experimental),
      colorOf,
    ),
    main: aggregate(
      exits.filter((f) => !reps.get(f.repertoireId)?.experimental),
      colorOf,
    ),
  }
}

/** The user's rating after each game of a site and speed, oldest first. */
export function ratingSeries(
  games: readonly Game[],
  site: Site,
  speed: Speed,
): { t: number; rating: number }[] {
  return games
    .filter((g) => g.site === site && g.speed === speed && g[g.userColor].rating !== undefined)
    .sort((a, b) => a.playedAt - b.playedAt)
    .map((g) => ({ t: g.playedAt, rating: g[g.userColor].rating! }))
}

/** The user's accuracy in each analyzed game (server value when Lichess gave one). */
export function userAccuracy(game: Game, analysis: Analysis): number | undefined {
  return (
    analysis.accuracy?.[game.userColor] ??
    gameAccuracy(analysis.plies.map((p) => p.eval))[game.userColor]
  )
}
