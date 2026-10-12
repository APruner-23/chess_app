import { winPercent } from '../analysis/winPercent'
import type { Eval } from '../import/types'
import { formatEval } from './evalFormat'

/**
 * Vertical bar: the white share is White's win%. Flipped when the board is.
 * The eval is written at the end of the side that is ahead, like on Lichess.
 */
export function EvalBar({ value, orientation }: { value?: Eval; orientation: 'white' | 'black' }) {
  const white = value ? winPercent(value) : 50
  const whiteAhead = white >= 50
  // The white end is at the bottom when the board shows White at the bottom.
  const atBottom = whiteAhead === (orientation === 'white')
  return (
    <div
      className={`relative flex w-10 shrink-0 overflow-hidden rounded bg-stone-700 ${
        orientation === 'white' ? 'flex-col-reverse' : 'flex-col'
      }`}
      title={value ? formatEval(value) : undefined}
      aria-label={value ? `Valutazione ${formatEval(value)}` : 'Nessuna valutazione'}
    >
      <div
        className="bg-stone-100 transition-[height] duration-300"
        style={{ height: `${white}%` }}
      />
      {value && (
        <span
          className={`absolute inset-x-0 text-center font-mono text-[11px] font-semibold tracking-tighter ${
            atBottom ? 'bottom-1' : 'top-1'
          } ${whiteAhead ? 'text-stone-900' : 'text-stone-100'}`}
        >
          {formatEval(value)}
        </span>
      )}
    </div>
  )
}
