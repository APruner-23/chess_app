import type { Board } from 'chessops/board'
import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'

export type Phase = 'opening' | 'middlegame' | 'endgame'

export const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Apertura',
  middlegame: 'Mediogioco',
  endgame: 'Finale',
}

/**
 * The phase in which a game ended, from its final position: a simplified version of
 * Lichess' divider. Endgame when at most 6 queens, rooks, bishops and knights are left;
 * opening while it's within the first 12 moves and more than 10 of them are on the board.
 */
export function endPhase(sans: readonly string[]): Phase {
  const pos = Chess.default()
  for (const san of sans) {
    const move = parseSan(pos, san)
    if (!move) break
    pos.play(move)
  }
  return phaseOf(pos.board, sans.length)
}

/** The phase of a position reached after `plies` half-moves. */
export function phaseOf(board: Board, plies: number): Phase {
  const pieces = board.occupied.diff(board.pawn).diff(board.king).size()
  if (pieces <= 6) return 'endgame'
  if (plies <= 24 && pieces > 10) return 'opening'
  return 'middlegame'
}
