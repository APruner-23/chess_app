import { winPercent } from '../analysis/winPercent'
import type { Eval } from '../import/types'
import { formatEval } from './evalFormat'

/** Vertical bar: the white share is White's win%. Flipped when the board is. */
export function EvalBar({ value, orientation }: { value?: Eval; orientation: 'white' | 'black' }) {
  const white = value ? winPercent(value) : 50
  return (
    <div
      className={`relative flex w-4 shrink-0 overflow-hidden rounded bg-stone-700 ${
        orientation === 'white' ? 'flex-col-reverse' : 'flex-col'
      }`}
      title={value ? formatEval(value) : undefined}
      aria-label={value ? `Valutazione ${formatEval(value)}` : 'Nessuna valutazione'}
    >
      <div
        className="bg-stone-100 transition-[height] duration-300"
        style={{ height: `${white}%` }}
      />
    </div>
  )
}
