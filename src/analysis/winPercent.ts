import type { Eval } from '../import/types'

/** lila Cp.CEILING: evals are clamped here and mates count as ±1000. */
export const CP_CEILING = 1000
/** lila Cp.initial: eval of the start position used before the first ply. */
export const INITIAL_EVAL: Eval = { cp: 15 }

/** Centipawns from White's point of view, clamped to ±1000 (mate → ±1000). */
export function ceiledCp(e: Eval): number {
  if ('mate' in e) return e.mate > 0 || Object.is(e.mate, 0) ? CP_CEILING : -CP_CEILING
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, e.cp))
}

/** Winning chances on a −1…1 scale, White's point of view (lila WinPercent.winningChances). */
export function winningChances(e: Eval): number {
  return 2 / (1 + Math.exp(-0.00368208 * ceiledCp(e))) - 1
}

/** Win% for White, 0…100. */
export function winPercent(e: Eval): number {
  return 50 + 50 * winningChances(e)
}
