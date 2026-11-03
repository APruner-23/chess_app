import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { AUTO_ANALYZE_KEY, useAnalysisStore } from './analysisStore'
import { useImportStore } from './importStore'
import { SITE_LABELS, SITES, useAccounts } from './accounts'

/** Import from both sites and the background analysis of recent games, in one compact box. */
export function ImportPanel() {
  const { running, status, start, cancel } = useImportStore()
  const { background, startBackground, pauseBackground } = useAnalysisStore()
  const accounts = useAccounts()
  const counts = useLiveQuery(async () => ({
    games: await db.games.count(),
    analyzed: await db.analyses.count(),
    auto: await getSetting(db, AUTO_ANALYZE_KEY, false),
  }))
  const left = counts ? Math.max(0, counts.games - counts.analyzed) : 0

  const btn = 'rounded-md px-3 py-1.5 text-sm font-medium'
  return (
    <section className="mb-4 w-fit max-w-full rounded-lg border border-stone-800 bg-stone-950/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={running ? cancel : start}
          title="Importa le partite nuove da Chess.com e Lichess (gli account si cambiano in Impostazioni)"
          className={`${btn} bg-emerald-700 hover:bg-emerald-600`}
        >
          {running ? 'Interrompi' : 'Importa partite'}
        </button>
        {!!counts?.games && (
          <button
            type="button"
            onClick={background.running ? pauseBackground : startBackground}
            disabled={!background.running && left === 0}
            title="Analisi rapida di tutte le partite senza analisi, una alla volta: prima le recenti, e tra queste prima le sconfitte"
            className={`${btn} bg-stone-700 hover:bg-stone-600 disabled:opacity-40`}
          >
            {background.running ? 'Pausa analisi' : 'Analizza tutte'}
          </button>
        )}
        {!!counts?.games && (
          <span className="text-stone-400">
            {background.running
              ? `In analisi: ${background.done}/${background.total}${
                  background.etaMs !== undefined ? ` · ${formatEta(background.etaMs)}` : ''
                } · `
              : ''}
            {counts.analyzed} analizzate su {counts.games}
          </span>
        )}
        {!!counts?.games && (
          <label
            className="flex items-center gap-1.5 text-stone-400"
            title="Solo su questo dispositivo: sul telefono consuma batteria"
          >
            <input
              type="checkbox"
              checked={counts.auto}
              onChange={(e) => {
                void setSetting(db, AUTO_ANALYZE_KEY, e.target.checked)
                if (e.target.checked) void startBackground()
              }}
            />
            Analizza da sola quando l'app è aperta
          </label>
        )}
      </div>
      <ul className="mt-2 space-y-0.5">
        {SITES.map((site) => {
          const account = accounts?.find((a) => a.id === site)
          const s = status[site]
          return (
            <li key={site} className="flex flex-wrap gap-x-2">
              <span className="w-20 font-medium">{SITE_LABELS[site]}</span>
              <span className="text-stone-400">{account?.username || '—'}</span>
              <span className={s?.error ? 'text-red-400' : 'text-stone-500'}>
                {s?.error ??
                  s?.step ??
                  (account?.lastImportAt
                    ? `ultimo import ${new Date(account.lastImportAt).toLocaleString('it-IT')}`
                    : 'mai importato')}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** "circa 3 h 20 min rimaste" */
function formatEta(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'quasi finito'
  const h = Math.floor(min / 60)
  return `circa ${h ? `${h} h ` : ''}${min % 60} min rimasti`
}
