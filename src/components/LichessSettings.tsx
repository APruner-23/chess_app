import { useState } from 'react'
import { db } from '../db/schema'
import { setSetting } from '../db/settings'
import { RATING_BUCKETS, type ExplorerParams } from '../lichess/explorer'
import { TOKEN_KEY, authorizeUrl, codeChallenge, randomString } from '../lichess/oauth'
import {
  EXPLORER_KEY,
  oauthRedirectUri,
  useExplorerParams,
  useLichessConnected,
} from './lichessClient'

const SPEEDS = [
  ['bullet', 'Bullet'],
  ['blitz', 'Blitz'],
  ['rapid', 'Rapid'],
  ['classical', 'Classica'],
  ['correspondence', 'Corrispondenza'],
] as const

async function connect() {
  const verifier = randomString(48)
  const state = randomString(16)
  sessionStorage.setItem('oauth', JSON.stringify({ verifier, state }))
  location.assign(
    authorizeUrl({
      redirectUri: oauthRedirectUri(),
      challenge: await codeChallenge(verifier),
      state,
    }),
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Lichess connection (needed by the opening explorer) and explorer filters. */
export function LichessSettings() {
  const connected = useLichessConnected()
  const params = useExplorerParams()
  const [pasted, setPasted] = useState('')
  const save = (p: ExplorerParams) => setSetting(db, EXPLORER_KEY, p)
  const btn = 'rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600'

  return (
    <>
      <h2 className="pt-4 text-lg font-medium">Lichess</h2>
      <p className="text-sm text-stone-400">
        L'explorer delle aperture di Lichess richiede un collegamento. Il token resta solo su questo
        dispositivo e non finisce nei backup.
      </p>
      {connected ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-400">Collegato</span>
          <button
            type="button"
            className="rounded-md bg-stone-800 px-3 py-1.5"
            onClick={() => db.settings.delete(TOKEN_KEY)}
          >
            Scollega
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button type="button" className={btn} onClick={connect}>
            Collega Lichess
          </button>
          <div className="flex gap-2">
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="…oppure incolla un token personale (lio_…)"
              className="min-w-0 flex-1 rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="rounded-md bg-stone-800 px-3 text-sm"
              disabled={!pasted.trim()}
              onClick={() => setSetting(db, TOKEN_KEY, pasted.trim()).then(() => setPasted(''))}
            >
              Salva
            </button>
          </div>
        </div>
      )}

      <h3 className="pt-2 font-medium">Explorer “al tuo livello”</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {SPEEDS.map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={params.speeds.includes(value)}
              onChange={() => save({ ...params, speeds: toggle(params.speeds, value) })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {RATING_BUCKETS.map((r) => (
          <label key={r} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={params.ratings.includes(r)}
              onChange={() =>
                save({ ...params, ratings: toggle(params.ratings, r).sort((a, b) => a - b) })
              }
            />
            {r}
          </label>
        ))}
      </div>
    </>
  )
}
