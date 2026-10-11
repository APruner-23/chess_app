import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { SYNC_KEY_SETTING, SYNC_STATE_SETTING, type SyncState } from '../sync/sync'
import { useSyncStore } from './syncStore'

/** Sync key (same on every device) and status. */
export function SyncSettings() {
  const key = useLiveQuery(() => getSetting<string | undefined>(db, SYNC_KEY_SETTING, undefined))
  const state = useLiveQuery(() =>
    getSetting<SyncState | undefined>(db, SYNC_STATE_SETTING, undefined),
  )
  const { running, error, lastResult, run } = useSyncStore()
  const [draft, setDraft] = useState('')
  const btn =
    'rounded-md bg-stone-700 px-4 py-2 text-sm font-medium hover:bg-stone-600 disabled:opacity-40'

  return (
    <>
      <h2 className="pt-4 text-lg font-medium">Sincronizzazione</h2>
      <p className="text-sm text-stone-400">
        Tiene allineati PC e telefono tramite il tuo Worker Cloudflare. Usa la stessa chiave su ogni
        dispositivo: è quella impostata come SYNC_KEY nel pannello di Cloudflare. Resta solo su
        questo dispositivo.
      </p>
      {key ? (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-emerald-400">Attiva</span>
            <button type="button" className={btn} disabled={running} onClick={() => run()}>
              {running ? 'Sincronizzo…' : 'Sincronizza ora'}
            </button>
            <button
              type="button"
              className="rounded-md bg-stone-800 px-3 py-2"
              onClick={() => db.settings.delete(SYNC_KEY_SETTING)}
            >
              Disattiva
            </button>
          </div>
          {error && <p className="text-red-300">{error}</p>}
          {state?.lastSyncAt && (
            <p className="text-stone-400">
              Ultima sincronizzazione: {new Date(state.lastSyncAt).toLocaleString('it-IT')}
              {lastResult && ` · ${lastResult.pushed} inviati, ${lastResult.pulled} ricevuti`}
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Chiave di sincronizzazione"
            className="min-w-0 flex-1 rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            className={btn}
            disabled={!draft.trim()}
            onClick={async () => {
              await setSetting(db, SYNC_KEY_SETTING, draft.trim())
              setDraft('')
              await run()
            }}
          >
            Attiva
          </button>
        </div>
      )}
    </>
  )
}
