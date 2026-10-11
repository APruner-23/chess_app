import type { Eval } from '../import/types'

/** "+0.34", "−1.20", "#3", "#−2" — White's point of view, like Lichess. */
export function formatEval(e: Eval): string {
  if ('mate' in e) return e.mate >= 0 ? `#${e.mate}` : `#−${-e.mate}`
  const pawns = (e.cp / 100).toFixed(2)
  return e.cp > 0 ? `+${pawns}` : e.cp < 0 ? `−${pawns.slice(1)}` : '0.00'
}
