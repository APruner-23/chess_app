import type { GamePosition } from '../db/schema'
import type { Game } from './types'

/** Plies indexed per game: the first 30 moves are what openings and the explorer need. */
export const INDEXED_PLIES = 60

export function gamePositions(game: Game, epds: readonly string[]): GamePosition[] {
  const rows: GamePosition[] = []
  const last = Math.min(epds.length - 1, INDEXED_PLIES)
  for (let ply = 0; ply <= last; ply++) {
    rows.push({
      id: `${game.id}|${ply}`,
      gameId: game.id,
      epd: epds[ply]!,
      ply,
      ...(game.moves[ply] !== undefined ? { san: game.moves[ply] } : {}),
      userColor: game.userColor,
      result: game.result,
      speed: game.speed,
      playedAt: game.playedAt,
    })
  }
  return rows
}
