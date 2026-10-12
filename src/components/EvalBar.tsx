import { winPercent } from '../analysis/winPercent'
import type { Outcome } from '../chess/position'
import type { Eval } from '../import/types'
import { formatEval } from './evalFormat'

/**
 * Vertical bar: the white share is White's win%. Flipped when the board is.
 * The eval is written at the end of the side that is ahead, like on Lichess.
 */
export function EvalBar({
  value,
  orientation,
  outcome,
}: {
  value?: Eval
  orientation: 'white' | 'black'
  /** Finished position: the bar goes all the way to the winner, with the score. */
  outcome?: Outcome
}) {
  const white = outcome
    ? outcome.winner === 'white'
      ? 100
      : outcome.winner === 'black'
        ? 0
        : 50
    : value
      ? winPercent(value)
      : 50
  const label = outcome
    ? outcome.winner === 'white'
      ? '1-0'
      : outcome.winner === 'black'
        ? '0-1'
        : '½-½'
    : value && formatEval(value)
  const whiteAhead = white >= 50
  // The white end is at the bottom when the board shows White at the bottom.
  const atBottom = whiteAhead === (orientation === 'white')
  return (
    <div
      className={`relative flex w-10 shrink-0 overflow-hidden rounded bg-stone-700 ${
        orientation === 'white' ? 'flex-col-reverse' : 'flex-col'
      }`}
      title={label || undefined}
      aria-label={label ? `Valutazione ${label}` : 'Nessuna valutazione'}
    >
      <div
        className="bg-stone-100 transition-[height] duration-300"
        style={{ height: `${white}%` }}
      />
      {label && (
        <span
          className={`absolute inset-x-0 text-center font-mono text-[11px] font-semibold tracking-tighter ${
            atBottom ? 'bottom-1' : 'top-1'
          } ${whiteAhead ? 'text-stone-900' : 'text-stone-100'}`}
        >
          {label}
        </span>
      )}
    </div>
  )
}
