import type { Phase } from '../chess/phase'
import type { Motif } from './motifs'
import type { Color, Eval, Speed } from '../import/types'
import type { StoredFsrs } from '../training/types'

/**
 * A position from the user's own games where they made a mistake or a blunder and
 * the engine knows the better move. Derived from games and analyses on each device.
 */
export interface Puzzle {
  /** `<gameId>|<ply>` */
  id: string
  gameId: string
  /** Index in game.moves of the move the user got wrong. */
  ply: number
  /** Position before that move. */
  fen: string
  /** The opponent's previous move (UCI), to highlight it. */
  prevUci?: string
  /** Engine best move: UCI as stored by the analysis, and SAN. */
  solution: string
  solutionSan: string
  /** What the user played in the game. */
  played: string
  judgment: 'mistake' | 'blunder'
  /** The mistake was about a mate (allowing one, or missing one). */
  mate: boolean
  /** Tactical theme (`classifyPuzzle`). */
  motif: Motif
  /** Evals from White's point of view: with the best move, and after the game move. */
  evalBefore: Eval
  evalAfter: Eval
  color: Color
  phase: Phase
  playedAt: number
  speed: Speed
  opponent: string
  opponentRating?: number
}

/** The user's progress on a puzzle: the only puzzle data that is synced and backed up. */
export interface PuzzleProgress {
  /** Same id as the puzzle. */
  id: string
  fsrs: StoredFsrs
  attempts: number
  solved: number
  /** Whether the last attempt was right at the first try. */
  lastCorrect: boolean
  introducedAt: number
  updatedAt: number
}
