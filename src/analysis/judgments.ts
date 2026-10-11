import type { Color, Eval } from '../import/types'
import { INITIAL_EVAL } from './winPercent'

export type Judgment = 'inaccuracy' | 'mistake' | 'blunder'

export interface Advice {
  /** 0-based ply index. */
  ply: number
  color: Color
  judgment: Judgment
  /** True when the advice is about a mate appearing or being lost. */
  mate: boolean
}

/** Converts a White-POV eval to the mover's point of view. */
function pov(e: Eval, color: Color): Eval {
  if (color === 'white') return e
  return 'mate' in e ? { mate: -e.mate } : { cp: -e.cp }
}

/** lila MateAdvice: a mate appeared against the mover, or the mover lost a forced mate. */
function mateAdvice(prev: Eval, next: Eval, color: Color): Judgment | undefined {
  const p = pov(prev, color)
  const n = pov(next, color)
  const prevMate = 'mate' in p ? p.mate : undefined
  const nextMate = 'mate' in n ? n.mate : undefined
  const prevCp = 'cp' in p ? p.cp : 0
  const nextCp = 'cp' in n ? n.cp : 0
  const created = prevMate === undefined && nextMate !== undefined && nextMate < 0
  const lost = prevMate !== undefined && prevMate > 0 && (nextMate === undefined || nextMate < 0)
  if (created) return prevCp < -999 ? 'inaccuracy' : prevCp < -700 ? 'mistake' : 'blunder'
  if (lost) return nextCp > 999 ? 'inaccuracy' : nextCp > 700 ? 'mistake' : 'blunder'
  return undefined
}

/**
 * lila CpAdvice: thresholds on the mover's drop in winning chances (−1…1 scale).
 * Unlike accuracy, the cp values are not clamped to ±1000 here: the Lichess
 * cross-check (a +5764 eval judged as a blunder) only matches without clamping.
 */
function cpAdvice(prev: Eval, next: Eval, color: Color): Judgment | undefined {
  if ('mate' in prev || 'mate' in next) return undefined
  const chances = (cp: number) => 2 / (1 + Math.exp(-0.00368208 * cp)) - 1
  const delta = chances(next.cp) - chances(prev.cp)
  const drop = color === 'white' ? -delta : delta
  return drop >= 0.3 ? 'blunder' : drop >= 0.2 ? 'mistake' : drop >= 0.1 ? 'inaccuracy' : undefined
}

/**
 * Judgments for every ply; evals[i] is the eval after ply i+1, White's point of view.
 * `judged(ply)` restricts the plies that may be judged: Lichess only judges plies
 * for which its server computed a better variation.
 */
export function judgeMoves(
  evals: readonly Eval[],
  judged: (ply: number) => boolean = () => true,
): Advice[] {
  const advices: Advice[] = []
  evals.forEach((next, ply) => {
    if (!judged(ply)) return
    const prev = ply === 0 ? INITIAL_EVAL : evals[ply - 1]!
    const color: Color = ply % 2 === 0 ? 'white' : 'black'
    const mate = mateAdvice(prev, next, color)
    const judgment = mate ?? cpAdvice(prev, next, color)
    if (judgment) advices.push({ ply, color, judgment, mate: mate !== undefined })
  })
  return advices
}

export function countJudgments(advices: readonly Advice[], color: Color): Record<Judgment, number> {
  const counts = { inaccuracy: 0, mistake: 0, blunder: 0 }
  for (const a of advices) if (a.color === color) counts[a.judgment]++
  return counts
}
