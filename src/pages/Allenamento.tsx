import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { Trainer } from '../components/Trainer'
import { DEFAULT_EXPLORER } from '../lichess/explorer'
import { EXPLORER_KEY, explorer } from '../components/lichessClient'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { totalGames } from '../lichess/explorer'
import { reachProbabilities } from '../repertoire/coverage'
import { RepGraph, turnOf } from '../repertoire/graph'
import { loadMoves } from '../repertoire/repo'
import type { RepMove } from '../repertoire/types'
import { hardCards, trainingStats } from '../training/cards'
import { prepareSession, type SessionMode, type TrainingLine } from '../training/prepare'
import { DEFAULT_NEW_PER_DAY, NEW_PER_DAY_KEY, recordAnswer, syncAllCards } from '../training/repo'

const DAY_NAMES = ['oggi', 'dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

export function Allenamento() {
  const [session, setSession] = useState<{ mode: SessionMode; lines: TrainingLine[] }>()
  useEffect(() => {
    void syncAllCards(db)
  }, [])
  const data = useLiveQuery(async () => ({
    cards: await db.cards.toArray(),
    logs: await db.reviewLogs.toArray(),
    reps: await db.repertoires.toArray(),
    newPerDay: await getSetting(db, NEW_PER_DAY_KEY, DEFAULT_NEW_PER_DAY),
  }))
  const [now] = useState(() => Date.now())

  if (!data) return <PageHeader title="Allenamento" />
  const stats = trainingStats(data.cards, data.logs, now)
  const newLimit = Math.max(0, data.newPerDay - stats.introducedToday)

  async function start(mode: SessionMode) {
    const movesByRep = new Map<string, RepMove[]>()
    const reach = new Map<string, number>()
    const params = await getSetting(db, EXPLORER_KEY, DEFAULT_EXPLORER)
    for (const rep of data!.reps) {
      const moves = await loadMoves(db, rep.id)
      movesByRep.set(rep.id, moves)
      if (mode !== 'learn') continue
      // Explorer frequencies already cached (no network): opponent replies seen more often come first.
      const graph = new RepGraph(moves)
      const freqs = new Map<string, { san: string; games: number }[]>()
      for (const epd of graph.reachable().epds) {
        if (turnOf(epd) === rep.color) continue
        const r = await explorer.peek('lichess', epd, params)
        if (r)
          freqs.set(
            epd,
            r.moves.map((m) => ({ san: m.san, games: totalGames(m) })),
          )
      }
      for (const [epd, p] of reachProbabilities(graph, rep.color, (e) => freqs.get(e))) {
        reach.set(`${rep.id}|${epd}`, p)
      }
    }
    const lines = prepareSession(mode, {
      repertoires: data!.reps,
      movesByRep,
      cards: data!.cards,
      logs: data!.logs,
      now: Date.now(),
      newLimit,
      reach: (c) => reach.get(c.id) ?? 0,
    })
    setSession({ mode, lines })
  }

  if (session) {
    const mode =
      session.mode === 'learn' ? 'learn' : session.mode === 'review' ? 'review' : 'practice'
    return (
      <>
        <PageHeader
          title={
            session.mode === 'learn'
              ? 'Impara'
              : session.mode === 'review'
                ? 'Ripassa'
                : 'Difficili'
          }
        />
        <Trainer
          lines={session.lines}
          onAnswer={(cardId, correct, ms) => {
            const card = data.cards.find((c) => c.id === cardId)
            if (card) void recordAnswer(db, card, mode, correct, ms)
          }}
          onExit={() => setSession(undefined)}
        />
      </>
    )
  }

  const hard = hardCards(data.cards, data.logs).length
  const maxDue = Math.max(1, ...stats.dueByDay)
  const tile = 'rounded-lg border border-stone-800 bg-stone-950/40 p-4'
  const action = 'mt-3 w-full rounded-md px-4 py-2 font-medium disabled:opacity-40'

  return (
    <>
      <PageHeader title="Allenamento">
        Impara poche posizioni nuove al giorno, poi ripassa solo quelle che stai per dimenticare.
      </PageHeader>
      {data.cards.length === 0 ? (
        <p className="text-stone-400">
          Nessuna posizione da allenare: crea un repertorio e aggiungi le tue mosse in Repertori.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={tile}>
              <div className="text-sm text-stone-400">Nuove</div>
              <div className="text-3xl font-semibold">{Math.min(newLimit, stats.newAvailable)}</div>
              <div className="text-xs text-stone-500">
                oggi, su {stats.newAvailable} da imparare (max {data.newPerDay} al giorno)
              </div>
              <button
                type="button"
                className={`${action} bg-emerald-700 hover:bg-emerald-600`}
                disabled={!newLimit || !stats.newAvailable}
                onClick={() => start('learn')}
              >
                Impara
              </button>
            </div>
            <div className={tile}>
              <div className="text-sm text-stone-400">Da ripassare</div>
              <div className="text-3xl font-semibold">{stats.dueNow}</div>
              <div className="text-xs text-stone-500">posizioni in scadenza adesso</div>
              <button
                type="button"
                className={`${action} bg-sky-700 hover:bg-sky-600`}
                disabled={!stats.dueNow}
                onClick={() => start('review')}
              >
                Ripassa
              </button>
            </div>
            <div className={tile}>
              <div className="text-sm text-stone-400">Difficili</div>
              <div className="text-3xl font-semibold">{hard}</div>
              <div className="text-xs text-stone-500">
                sbagliate più spesso: pratica libera, non cambia i ripassi
              </div>
              <button
                type="button"
                className={`${action} bg-stone-700 hover:bg-stone-600`}
                disabled={!hard}
                onClick={() => start('hard')}
              >
                Esercitati
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className={`${tile} sm:col-span-2`}>
              <div className="mb-2 text-sm text-stone-400">Ripassi nei prossimi 7 giorni</div>
              <div className="flex h-24 items-end gap-2">
                {stats.dueByDay.map((n, i) => {
                  const d = new Date(now + i * 86_400_000)
                  return (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${n} posizioni`}
                    >
                      <span className="text-xs text-stone-300">{n}</span>
                      <div
                        className="w-full rounded-t bg-sky-600"
                        style={{ height: `${(n / maxDue) * 56}px` }}
                      />
                      <span className="text-xs text-stone-500">
                        {i === 0 ? DAY_NAMES[0] : DAY_NAMES[d.getDay() + 1]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className={tile}>
              <div className="text-sm text-stone-400">Ricordate (30 giorni)</div>
              <div className="text-2xl font-semibold">
                {stats.retention !== undefined ? `${Math.round(stats.retention * 100)}%` : '—'}
              </div>
              <div className="mt-2 text-sm text-stone-400">Serie</div>
              <div className="text-2xl font-semibold">
                {stats.streak} {stats.streak === 1 ? 'giorno' : 'giorni'}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
