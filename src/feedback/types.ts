import type { Eval, GameResult } from '../import/types'

/**
 * deviation: the user left the repertoire; hole: the opponent played an unprepared
 * move; extend: a mistake soon after the book ended (engine move proposed);
 * exit: where the game left preparation (statistics only, never in the inbox).
 */
export type FeedbackKind = 'deviation' | 'hole' | 'extend' | 'exit'
export type FeedbackStatus = 'open' | 'done' | 'ignored' | 'info'

export interface FeedbackItem {
  /** `<gameId>|<repertoireId>|<kind>` */
  id: string
  gameId: string
  repertoireId: string
  kind: FeedbackKind
  /** Ply index of the move in question (0 = White's first move). */
  ply: number
  /** Position before that move. */
  epd: string
  /** SAN moves from the start up to `epd`. */
  path: string[]
  /** Move played in the game at `ply`. */
  san?: string
  /** Repertoire main move (deviation). */
  expectedSan?: string
  /** Engine move (extend), SAN. */
  bestSan?: string
  /** Eval when the game left the book (White's point of view), if analyzed. */
  exitEval?: Eval
  /** How many plies the game stayed in the repertoire. */
  bookPlies: number
  result: GameResult
  playedAt: number
  status: FeedbackStatus
  updatedAt: number
}
