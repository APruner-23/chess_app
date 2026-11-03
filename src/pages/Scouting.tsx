import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { SITE_LABELS } from '../components/accounts'
import { SPEED_LABELS } from '../components/format'
import { figurine } from '../chess/figurine'
import { db } from '../db/schema'
import type { Site, Speed } from '../import/types'
import { loadOpenings } from '../openings/load'
import { RepGraph } from '../repertoire/graph'
import { loadMoves } from '../repertoire/repo'
import { fetchScoutGames } from '../scouting/fetch'
import { scoutReport, type ScoutReport } from '../scouting/report'

const field = 'rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm'
const tile = 'rounded-lg border border-stone-800 bg-stone-950/40 p-4'

/** One move with its number: "2.♘c3" or "2…♘f6". */
const numbered = (ply: number, san: string) =>
  `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}${figurine(san)}`

/** "1.e4 c6 2.♘c3": moves numbered from the start. */
function line(sans: readonly string[]): string {
  return sans.map((s, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${figurine(s)}`).join(' ')
}

/**
 * Scouting an opponent: their recent games (downloaded, not stored), the openings they
 * play, and the moves of theirs that the user's repertoires don't answer yet.
 */
export function Scouting() {
  const [params, setParams] = useSearchParams()
  const [site, setSite] = useState<Site>((params.get('site') as Site | null) ?? 'chesscom')
  const [user, setUser] = useState(params.get('user') ?? '')
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; report: ScoutReport; name: string }
  >({ kind: 'idle' })
  const reps = useLiveQuery(() => db.repertoires.toArray())

  const target = params.get('user')
  const targetSite = (params.get('site') as Site | null) ?? 'chesscom'
  useEffect(() => {
    if (!target || !reps) return
    const controller = new AbortController()
    void (async () => {
      setState({ kind: 'loading' })
      try {
        const games = await fetchScoutGames(targetSite, target, {
          openings: await loadOpenings(),
          signal: controller.signal,
        })
        const withGraphs = await Promise.all(
          reps.map(async (r) => ({
            repertoire: r,
            graph: new RepGraph(await loadMoves(db, r.id)),
          })),
        )
        setState({ kind: 'done', report: scoutReport(games, withGraphs), name: target })
      } catch (e) {
        if (!controller.signal.aborted)
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => controller.abort()
  }, [target, targetSite, reps])

  const repName = (id: string) => reps?.find((r) => r.id === id)?.name ?? 'repertorio'

  return (
    <>
      <PageHeader title="Scouting di un avversario">
        Le sue ultime partite (scaricate, non salvate): cosa gioca e dove il tuo repertorio non ha
        ancora una risposta.
      </PageHeader>
      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (user.trim()) setParams({ site, user: user.trim() })
        }}
      >
        <select
          aria-label="Sito"
          value={site}
          onChange={(e) => setSite(e.target.value as Site)}
          className={field}
        >
          <option value="chesscom">Chess.com</option>
          <option value="lichess">Lichess</option>
        </select>
        <input
          aria-label="Nome utente"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Nome utente"
          className={`${field} min-w-0 flex-1 sm:max-w-xs`}
        />
        <button
          type="submit"
          disabled={!user.trim() || state.kind === 'loading'}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
        >
          Analizza
        </button>
      </form>

      {state.kind === 'loading' && <p className="text-stone-400">Scarico le partite…</p>}
      {state.kind === 'error' && <p className="text-red-300">{state.message}</p>}
      {state.kind === 'done' && (
        <Report report={state.report} name={state.name} site={targetSite} repName={repName} />
      )}
    </>
  )
}

function Report({
  report,
  name,
  site,
  repName,
}: {
  report: ScoutReport
  name: string
  site: Site
  repName: (id: string) => string
}) {
  if (report.games === 0) return <p className="text-stone-400">Nessuna partita trovata.</p>
  const speeds = [...report.speeds].sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-4">
      <p className="text-stone-300">
        <span className="font-semibold">{name}</span> ({SITE_LABELS[site]}): {report.games} partite
        recenti, fa il {Math.round((report.score.score ?? 0) * 100)}% dei punti ·{' '}
        {speeds.map(([s, n]) => `${SPEED_LABELS[s as Speed] ?? s} ${n}`).join(', ')}
      </p>

      <section className={tile}>
        <h2 className="font-medium">Contro i tuoi repertori</h2>
        <p className="mb-2 text-sm text-stone-400">
          In {report.meetings} partite gioca linee che hai nel repertorio.
        </p>
        {report.holes.length === 0 ? (
          <p className="text-sm text-stone-300">
            Nelle sue partite non ci sono mosse a cui il tuo repertorio non risponda.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.holes.map((h) => (
              <li
                key={`${h.repertoireId}|${h.path.join(' ')}|${h.san}`}
                className="flex flex-wrap items-center gap-x-2"
              >
                <span>
                  {h.path.length ? `Dopo ${line(h.path)} gioca ` : 'Apre con '}
                  <span className="font-semibold">{numbered(h.path.length, h.san)}</span>{' '}
                  <span className="text-stone-400">
                    ({h.games} {h.games === 1 ? 'partita' : 'partite'}): «{repName(h.repertoireId)}»
                    non ha una risposta
                  </span>
                </span>
                <Link
                  to={`/repertori/${h.repertoireId}?linea=${encodeURIComponent([...h.path, h.san].join(','))}`}
                  className="rounded bg-stone-800 px-2 py-0.5 text-xs hover:bg-stone-700"
                >
                  Prepara la risposta
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['white', 'black'] as const).map((c) => (
          <section key={c} className={tile}>
            <h2 className="mb-2 font-medium">
              Le sue aperture col {c === 'white' ? 'Bianco' : 'Nero'}
            </h2>
            {report.openings[c].length === 0 ? (
              <p className="text-sm text-stone-500">Nessuna partita.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr>
                    <th className="py-1 font-normal">Apertura</th>
                    <th className="text-right font-normal">Partite</th>
                    <th className="text-right font-normal">Suo punteggio</th>
                  </tr>
                </thead>
                <tbody>
                  {report.openings[c].map((o) => (
                    <tr key={o.name} className="border-t border-stone-800">
                      <td className="py-1">{o.name}</td>
                      <td className="text-right">{o.games}</td>
                      <td className="text-right">{Math.round(o.score)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
