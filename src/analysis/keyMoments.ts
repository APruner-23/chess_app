import type { Color, Eval } from '../import/types'
import { INITIAL_EVAL, winFor } from './winPercent'

export interface KeyMoment {
  /** Index of the move in the game. */
  ply: number
  color: Color
  /** The mover's win% before and after the move. */
  before: number
  after: number
}

/**
 * The moves that swung the game the most: the largest drops in the mover's winning
 * chances, at least `minSwing` points, in game order. evals[i] is the eval after ply i.
 */
export function keyMoments(evals: readonly Eval[], n = 3, minSwing = 15): KeyMoment[] {
  return evals
    .map((next, ply) => {
      const color: Color = ply % 2 === 0 ? 'white' : 'black'
      const prev = ply === 0 ? INITIAL_EVAL : evals[ply - 1]!
      return { ply, color, before: winFor(prev, color), after: winFor(next, color) }
    })
    .filter((m) => m.before - m.after >= minSwing)
    .sort((a, b) => b.before - b.after - (a.before - a.after))
    .slice(0, n)
    .sort((a, b) => a.ply - b.ply)
}
