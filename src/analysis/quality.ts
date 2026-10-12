import type { Color, Eval } from '../import/types'
import { judgeMove, type Advice, type Judgment } from './judgments'
import { INITIAL_EVAL, winPercent } from './winPercent'

/** Positive labels, like Chess.com's: the bad ones are the Lichess judgments. */
export type Quality = 'book' | 'best' | 'excellent' | 'good'

/** Win% points the mover may lose and still get the label (inaccuracy starts at 5). */
const EXCELLENT_DROP = 2
const GOOD_DROP = 5

/**
 * Labels the moves without a judgment. `bookPlies` moves from the start are theory;
 * `isBest(ply)` tells whether the move played is the engine's best move.
 */
export function moveQualities(
  evals: readonly Eval[],
  advices: ReadonlyMap<number, Advice>,
  bookPlies: number,
  isBest: (ply: number) => boolean,
): Map<number, Quality> {
  const out = new Map<number, Quality>()
  evals.forEach((next, ply) => {
    if (advices.has(ply)) return
    if (ply < bookPlies) return void out.set(ply, 'book')
    if (isBest(ply)) return void out.set(ply, 'best')
    const prev = ply === 0 ? INITIAL_EVAL : evals[ply - 1]!
    const q = dropQuality(prev, next, ply % 2 === 0 ? 'white' : 'black')
    if (q) out.set(ply, q)
  })
  return out
}

function dropQuality(prev: Eval, next: Eval, color: Color): Quality | undefined {
  const sign = color === 'white' ? 1 : -1
  const drop = sign * (winPercent(prev) - winPercent(next))
  return drop < EXCELLENT_DROP ? 'excellent' : drop < GOOD_DROP ? 'good' : undefined
}

/** Label of one move outside the stored analysis (e.g. a variation tried on the board). */
export function classifyMove(
  prev: Eval,
  next: Eval,
  color: Color,
  isBest: boolean,
): Quality | Judgment | undefined {
  return judgeMove(prev, next, color) ?? (isBest ? 'best' : dropQuality(prev, next, color))
}

export const QUALITY_LABELS: Record<Quality, string> = {
  book: 'Teoria',
  best: 'Migliore',
  excellent: 'Ottima',
  good: 'Buona',
}

export const QUALITY_SYMBOLS: Record<Quality, string> = {
  book: '',
  best: '★',
  excellent: '!',
  good: '✓',
}
