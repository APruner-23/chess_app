import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const AXIS = '#78716c'
/** Translucent so the grid reads on both the dark and the light theme. */
const GRID = 'rgb(120 113 108 / 0.25)'

export interface BarSeries {
  key: string
  label: string
  color: string
}

/**
 * Vertical bars by category, one or two series (grouped). Two series get a legend;
 * hover shows every value of the category with `format`.
 */
export function Bars({
  data,
  x,
  series,
  format,
  height = 200,
  reference,
  extra,
}: {
  data: Record<string, unknown>[]
  x: string
  series: BarSeries[]
  format: (v: number) => string
  height?: number
  /** A horizontal reference line (e.g. 50% score). */
  reference?: number
  /** Extra tooltip line for a category. */
  extra?: (row: Record<string, unknown>) => ReactNode
}) {
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-1 flex gap-4 text-xs text-stone-300">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={x} stroke={AXIS} fontSize={12} tickLine={false} interval={0} />
            <YAxis
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => format(v)}
              width={48}
            />
            {reference !== undefined && (
              <ReferenceLine y={reference} stroke={AXIS} strokeDasharray="4 4" />
            )}
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: '#ffffff0d' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Record<string, unknown> | undefined
                if (!active || !row) return null
                return (
                  <div className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs">
                    <div className="mb-0.5 font-medium">{String(row[x])}</div>
                    {series.map((s) =>
                      typeof row[s.key] === 'number' ? (
                        <div key={s.key} className="flex items-center gap-1.5 text-stone-300">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: s.color }}
                          />
                          {s.label}: {format(row[s.key] as number)}
                        </div>
                      ) : null,
                    )}
                    {extra && <div className="text-stone-400">{extra(row)}</div>}
                  </div>
                )
              }}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * A small single-series line by month, with an optional vertical marker (e.g. when the
 * user started training with the app).
 */
export function MonthLine({
  data,
  dataKey,
  format,
  color,
  marker,
  domain = ['auto', 'auto'],
  height = 140,
}: {
  data: Record<string, unknown>[]
  dataKey: string
  format: (v: number) => string
  color: string
  /** Label (x value) where the marker goes, and its text. */
  marker?: { at: string; text: string }
  /** Y range, as Recharts takes it (e.g. [0, 1] for shares). */
  domain?: [number | 'auto', number | 'auto']
  height?: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} minTickGap={16} />
          <YAxis
            stroke={AXIS}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => format(v)}
            width={44}
            domain={domain}
          />
          {marker && (
            <ReferenceLine
              x={marker.at}
              stroke={AXIS}
              strokeDasharray="4 4"
              label={{ value: marker.text, position: 'insideTopLeft', fill: AXIS, fontSize: 10 }}
            />
          )}
          <Tooltip
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined
              if (!active || !row || typeof row[dataKey] !== 'number') return null
              return (
                <div className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs">
                  {String(row.label)}: {format(row[dataKey] as number)}
                  <span className="text-stone-400"> · {row.games as number} partite</span>
                </div>
              )
            }}
          />
          <Line
            type="linear"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, stroke: color }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
