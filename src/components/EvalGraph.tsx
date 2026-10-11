import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Dot,
} from 'recharts'
import { winPercent } from '../analysis/winPercent'
import type { Advice } from '../analysis/judgments'
import { JUDGMENT_SYMBOLS } from '../analysis/summary'
import { figurine } from '../chess/figurine'
import type { Eval } from '../import/types'
import { formatEval } from './evalFormat'

interface EvalGraphProps {
  /** evals[i] = eval after ply i+1. */
  evals: Eval[]
  moves: string[]
  advices: Map<number, Advice>
  /** Current position, in plies from the start. */
  ply: number
  onSelect: (ply: number) => void
}

const JUDGMENT_FILL = { inaccuracy: '#eab308', mistake: '#f97316', blunder: '#ef4444' }

function moveLabel(ply: number, moves: string[]): string {
  if (ply === 0) return 'Inizio'
  const n = Math.ceil(ply / 2)
  return `${n}${ply % 2 ? '.' : '…'} ${figurine(moves[ply - 1]!)}`
}

/** White's win% over the game; click a point to jump to that move. */
export function EvalGraph({ evals, moves, advices, ply, onSelect }: EvalGraphProps) {
  const data = [{ ply: 0, win: 50, label: 'Inizio' }].concat(
    evals.map((e, i) => ({ ply: i + 1, win: winPercent(e), label: formatEval(e) })),
  )
  return (
    <div className="h-28 w-full select-none" aria-label="Grafico della valutazione">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
          onClick={(state) => {
            const index = Number(state?.activeTooltipIndex)
            if (Number.isFinite(index)) onSelect(index)
          }}
          className="cursor-pointer"
        >
          <XAxis dataKey="ply" hide />
          <YAxis domain={[0, 100]} hide />
          <ReferenceLine y={50} stroke="#57534e" />
          <ReferenceLine x={ply} stroke="#10b981" strokeWidth={2} />
          <Tooltip
            cursor={{ stroke: '#a8a29e', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!active || !p) return null
              const advice = p.ply > 0 ? advices.get(p.ply - 1) : undefined
              return (
                <div className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100">
                  {moveLabel(p.ply, moves)}
                  {advice && ` ${JUDGMENT_SYMBOLS[advice.judgment]}`} · {p.label}
                </div>
              )
            }}
          />
          <Area
            type="linear"
            dataKey="win"
            baseValue={50}
            stroke="#e7e5e4"
            strokeWidth={2}
            fill="#e7e5e4"
            fillOpacity={0.25}
            isAnimationActive={false}
            dot={(props) => {
              const advice = props.index > 0 ? advices.get(props.index - 1) : undefined
              if (!advice) return <g key={props.index} />
              return (
                <Dot
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={JUDGMENT_FILL[advice.judgment]}
                  stroke="#1c1917"
                  strokeWidth={2}
                />
              )
            }}
            activeDot={{ r: 4, fill: '#10b981', stroke: '#1c1917', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
