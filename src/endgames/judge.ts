import { ceiledCp } from '../analysis/winPercent'
import type { GameEnd } from '../sparring/bot'
import type { Color, Eval } from '../import/types'
import type { EndgameGoal } from './catalog'

/** User's moves to survive in a "draw" exercise. */
export const HOLD_MOVES = 15
/** A winning exercise is lost when the user's advantage drops below this (pawns). */
export const WIN_KEPT = 2
/** After promoting, the user must be at least this far ahead (pawns) for it to count. */
export const PROMOTED_WIN = 4
/** A drawing exercise is lost when the user is this far behind (pawns). */
export const DRAW_LOST = -2.5

export type Verdict = { ok: true; why: string } | { ok: false; why: string }

/** Pawns from the user's point of view (mates count as ±10). */
const pawnsFor = (e: Eval, color: Color) => (ceiledCp(e) / 100) * (color === 'white' ? 1 : -1)

/**
 * Whether an endgame exercise is over, after the latest move. `evaluation` is the
 * engine's eval of the current position (White's view) when known; `promoted` is set
 * once the user has queened.
 */
export function judgeEndgame(s: {
  goal: EndgameGoal
  color: Color
  end?: GameEnd
  evaluation?: Eval
  promoted: boolean
  userMoves: number
}): Verdict | undefined {
  const { goal, color, end } = s
  const pawns = s.evaluation && pawnsFor(s.evaluation, color)
  if (end) {
    if (end.reason === 'checkmate')
      return end.winner === color
        ? { ok: true, why: 'Scacco matto!' }
        : { ok: false, why: 'Hai subito scacco matto.' }
    return goal === 'draw'
      ? { ok: true, why: 'Patta raggiunta.' }
      : { ok: false, why: 'È finita patta: la vittoria è sfuggita.' }
  }
  if (goal === 'draw') {
    if (pawns !== undefined && pawns <= DRAW_LOST)
      return { ok: false, why: 'La posizione ora è persa.' }
    if (s.userMoves >= HOLD_MOVES)
      return { ok: true, why: `Hai tenuto la patta per ${HOLD_MOVES} mosse.` }
    return undefined
  }
  if (pawns !== undefined && pawns < WIN_KEPT)
    return { ok: false, why: 'Il vantaggio è sfumato: ora non si vince più.' }
  if (goal === 'promote' && s.promoted && pawns !== undefined && pawns >= PROMOTED_WIN)
    return { ok: true, why: 'Pedone promosso: la vittoria è tua.' }
  return undefined
}
