import { replaySan } from '../chess/position'
import type { Color, Game } from '../import/types'
import { openingStats, type OpeningStats } from '../openings/stats'
import { RepGraph } from '../repertoire/graph'
import type { Repertoire } from '../repertoire/types'
import { scoreOf, type Score } from '../stats/games'

export interface ScoutHole {
  repertoireId: string
  /** Moves from the start up to the opponent's move the repertoire has no answer to. */
  path: string[]
  /** The opponent's move. */
  san: string
  games: number
}

export interface ScoutReport {
  games: number
  /** The scouted player's results. */
  score: Score
  speeds: Map<string, number>
  /** Their openings with each color (families), most played first. */
  openings: Record<Color, OpeningStats[]>
  /** Games where they entered one of the user's repertoires (≥ 2 plies in book). */
  meetings: number
  /** Their moves the user's repertoires don't answer, most frequent first. */
  holes: ScoutHole[]
}

/**
 * What a player tends to play, and where their moves fall outside the user's
 * repertoires. `games` are seen from the scouted player's side; the user meets them
 * with the other color.
 */
export function scoutReport(
  games: readonly Game[],
  reps: readonly { repertoire: Repertoire; graph: RepGraph }[],
): ScoutReport {
  const speeds = new Map<string, number>()
  for (const g of games) speeds.set(g.speed, (speeds.get(g.speed) ?? 0) + 1)
  const holes = new Map<string, ScoutHole>()
  let meetings = 0
  for (const g of games) {
    // The user plays the other color against them.
    const mine: Color = g.userColor === 'white' ? 'black' : 'white'
    let epds: string[]
    try {
      epds = replaySan(g.moves).epds
    } catch {
      continue
    }
    let met = false
    for (const { repertoire, graph } of reps) {
      if (repertoire.color !== mine) continue
      for (let ply = 0; ply < g.moves.length; ply++) {
        const children = graph.children(epds[ply]!)
        if (children.length === 0) break
        const san = g.moves[ply]!
        if (children.some((m) => m.san === san)) {
          if (ply >= 1) met = true
          continue
        }
        const theirTurn = (ply % 2 === 0) === (g.userColor === 'white')
        if (theirTurn) {
          const path = g.moves.slice(0, ply)
          const key = `${repertoire.id}|${path.join(' ')}|${san}`
          const h = holes.get(key) ?? { repertoireId: repertoire.id, path, san, games: 0 }
          h.games++
          holes.set(key, h)
        }
        break // their opponent left the repertoire: what follows says nothing about it
      }
    }
    if (met) meetings++
  }
  return {
    games: games.length,
    score: scoreOf(games.map((g) => g.result)),
    speeds,
    openings: {
      white: openingStats(
        games.filter((g) => g.userColor === 'white'),
        'family',
      ).slice(0, 6),
      black: openingStats(
        games.filter((g) => g.userColor === 'black'),
        'family',
      ).slice(0, 6),
    },
    meetings,
    holes: [...holes.values()].sort((a, b) => b.games - a.games).slice(0, 8),
  }
}
