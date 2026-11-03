import { Link } from 'react-router'
import { impact, MIN_ANALYZED, type CoachReport, type Insight } from '../coach/insights'

const IMPACT_STYLE = {
  alto: 'border-red-800 bg-red-950/40 text-red-200',
  medio: 'border-amber-800 bg-amber-950/40 text-amber-200',
  basso: 'border-stone-700 bg-stone-900 text-stone-300',
}

function InsightCard({ insight, rank }: { insight: Insight; rank?: number }) {
  const level = impact(insight.cost)
  const strength = insight.kind === 'strength'
  return (
    <li className="flex gap-3 rounded-lg border border-stone-800 bg-stone-950/40 p-3">
      {rank !== undefined && (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs font-semibold">
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{insight.title}</span>
          {strength ? (
            <span className="rounded border border-emerald-800 bg-emerald-950/40 px-1.5 text-xs text-emerald-200">
              punto forte
            </span>
          ) : (
            <span
              className={`rounded border px-1.5 text-xs ${IMPACT_STYLE[level]}`}
              title={`Circa ${insight.cost.toFixed(1)} punti ogni 100 partite (stima)`}
            >
              impatto {level}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-stone-400">{insight.detail}</p>
      </div>
      {insight.action && (
        <Link
          to={insight.action.to}
          className="h-fit shrink-0 self-center rounded-md bg-stone-800 px-3 py-1.5 text-sm hover:bg-stone-700"
        >
          {insight.action.label}
        </Link>
      )}
    </li>
  )
}

/**
 * What to work on, most costly first, plus the strengths. `limit` shows only the top
 * items (home page).
 */
export function CoachList({ report, limit }: { report: CoachReport; limit?: number }) {
  const shown = limit ? report.weaknesses.slice(0, limit) : report.weaknesses
  return (
    <div className="space-y-3">
      {report.analyzed < MIN_ANALYZED && (
        <p className="rounded-lg border border-stone-800 bg-stone-950/40 p-3 text-sm text-stone-300">
          Hai solo {report.analyzed} partite analizzate tra le {report.games} considerate: i
          consigli su errori e temi tattici arrivano dopo almeno {MIN_ANALYZED}.{' '}
          <Link to="/partite" className="text-emerald-400 hover:underline">
            Analizza le partite →
          </Link>
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-stone-400">Nessun punto debole evidente: continua così.</p>
      ) : (
        <ol className="space-y-2">
          {shown.map((i, n) => (
            <InsightCard key={i.id} insight={i} rank={n + 1} />
          ))}
        </ol>
      )}
      {!limit && report.strengths.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-medium text-stone-300">I tuoi punti forti</h3>
          <ul className="space-y-2">
            {report.strengths.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
