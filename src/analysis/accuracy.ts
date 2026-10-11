import type { Color, Eval } from '../import/types'
import { INITIAL_EVAL, winPercent } from './winPercent'

/** Accuracy of one move from the mover's win% before and after it (lila AccuracyPercent). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100
  const raw =
    103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411
  return Math.max(0, Math.min(100, raw + 1)) // +1 uncertainty bonus
}

function standardDeviation(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length)
}

function harmonicMean(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  if (xs.some((x) => x === 0)) return 0
  return xs.length / xs.reduce((a, x) => a + 1 / x, 0)
}

function weightedMean(pairs: [value: number, weight: number][]): number | undefined {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  if (pairs.length === 0 || total === 0) return undefined
  return pairs.reduce((a, [v, w]) => a + v * w, 0) / total
}

export interface MoveAccuracy {
  /** 0-based ply index (0 = White's first move). */
  ply: number
  color: Color
  accuracy: number
}

/** Per-move accuracies; evals[i] is the eval after ply i+1, from White's point of view. */
export function moveAccuracies(evals: readonly Eval[]): MoveAccuracy[] {
  const wins = [INITIAL_EVAL, ...evals].map(winPercent)
  return evals.map((_, ply) => {
    const color: Color = ply % 2 === 0 ? 'white' : 'black'
    const before = wins[ply]!
    const after = wins[ply + 1]!
    const accuracy =
      color === 'white' ? moveAccuracy(before, after) : moveAccuracy(100 - before, 100 - after)
    return { ply, color, accuracy }
  })
}

/**
 * Game accuracy per color, as in lila AccuracyPercent.gameAccuracy: the average of a
 * volatility-weighted mean and a harmonic mean of the move accuracies.
 */
export function gameAccuracy(evals: readonly Eval[]): Partial<Record<Color, number>> {
  const wins = [INITIAL_EVAL, ...evals].map(winPercent)
  const windowSize = Math.max(2, Math.min(8, Math.floor(evals.length / 10)))
  // The first windows repeat the opening window so every move gets a weight.
  const windows: number[][] = []
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++)
    windows.push(wins.slice(0, windowSize))
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize))
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, standardDeviation(w))))

  const moves = moveAccuracies(evals)
  const result: Partial<Record<Color, number>> = {}
  for (const color of ['white', 'black'] as const) {
    const mine = moves.filter((m) => m.color === color && weights[m.ply] !== undefined)
    const weighted = weightedMean(mine.map((m) => [m.accuracy, weights[m.ply]!]))
    const harmonic = harmonicMean(mine.map((m) => m.accuracy))
    if (weighted !== undefined && harmonic !== undefined) result[color] = (weighted + harmonic) / 2
  }
  return result
}
