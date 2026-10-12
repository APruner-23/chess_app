import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { BACKGROUND_GAMES, useAnalysisStore } from './analysisStore'
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
  }))

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
            title="Il motore analizza le partite recenti senza analisi, una alla volta"
            className={`${btn} bg-stone-700 hover:bg-stone-600`}
          >
            {background.running ? 'Pausa analisi' : `Analizza le ultime ${BACKGROUND_GAMES}`}
          </button>
        )}
        {!!counts?.games && (
          <span className="text-stone-400">
            {background.running ? `In analisi: ${background.done}/${background.total} · ` : ''}
            {counts.analyzed} analizzate su {counts.games}
          </span>
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
