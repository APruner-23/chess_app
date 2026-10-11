import type { Analysis, Color } from '../import/types'
import { gameAccuracy, moveAccuracies } from './accuracy'
import { countJudgments, judgeMoves, type Advice, type Judgment } from './judgments'

export interface AnalysisSummary {
  accuracy: Partial<Record<Color, number>>
  /** Judgment for each ply index that has one. */
  advices: Map<number, Advice>
  counts: Record<Color, Record<Judgment, number>>
  moveAccuracy: number[]
}

/** Everything the review page shows, derived from stored evals (cheap to recompute). */
export function summarize(analysis: Analysis): AnalysisSummary {
  const evals = analysis.plies.map((p) => p.eval)
  // Lichess only judges plies where its server gave a better move; mirror that for its evals.
  const judged =
    analysis.source === 'lichess'
      ? (ply: number) => analysis.plies[ply]!.best !== undefined
      : undefined
  const list = judgeMoves(evals, judged)
  const computed = gameAccuracy(evals)
  return {
    accuracy: {
      white: analysis.accuracy?.white ?? computed.white,
      black: analysis.accuracy?.black ?? computed.black,
    },
    advices: new Map(list.map((a) => [a.ply, a])),
    counts: { white: countJudgments(list, 'white'), black: countJudgments(list, 'black') },
    moveAccuracy: moveAccuracies(evals).map((m) => m.accuracy),
  }
}

export const JUDGMENT_SYMBOLS: Record<Judgment, string> = {
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

export const JUDGMENT_LABELS: Record<Judgment, string> = {
  inaccuracy: 'Imprecisioni',
  mistake: 'Errori',
  blunder: 'Errori gravi',
}
