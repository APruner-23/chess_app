import { useImportStore } from './importStore'
import { SITE_LABELS, SITES, useAccounts } from './accounts'

export function ImportPanel() {
  const { running, status, start, cancel } = useImportStore()
  const accounts = useAccounts()

  return (
    <section className="mb-6 rounded-lg border border-stone-800 bg-stone-950/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={running ? cancel : start}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600"
        >
          {running ? 'Interrompi' : 'Importa partite'}
        </button>
        <span className="text-sm text-stone-400">
          Importa le partite nuove da Chess.com e Lichess (gli account si cambiano in Impostazioni).
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {SITES.map((site) => {
          const account = accounts?.find((a) => a.id === site)
          const s = status[site]
          return (
            <li key={site} className="flex flex-wrap gap-x-2">
              <span className="w-24 font-medium">{SITE_LABELS[site]}</span>
              <span className="text-stone-400">{account?.username || '—'}</span>
              <span className={s?.error ? 'text-red-400' : 'text-stone-300'}>
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
