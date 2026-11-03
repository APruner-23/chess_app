import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EndgameTrainer } from '../components/EndgameTrainer'
import { PageHeader } from '../components/PageHeader'
import { db } from '../db/schema'
import { ENDGAMES, GOAL_LABELS, type Endgame } from '../endgames/catalog'
import { recordEndgame } from '../endgames/repo'
import { endgamesToday, endgameStatus } from '../endgames/session'

const DAY = 86_400_000

/**
 * Essential endgames against the engine, scheduled like the repertoire: today's
 * session (due + a couple of new ones), or any exercise from the list.
 */
export function Finali() {
  const progress = useLiveQuery(
    async () => new Map((await db.endgameProgress.toArray()).map((p) => [p.id, p])),
  )
  const [now] = useState(() => Date.now())
  /** The exercises being played and the current one. */
  const [session, setSession] = useState<{ list: Endgame[]; index: number }>()

  if (!progress) return <PageHeader title="Finali" />

  if (session) {
    const current = session.list[session.index]
    if (!current) {
      return (
        <>
          <PageHeader title="Finali" />
          <div className="max-w-md space-y-3 rounded-lg bg-stone-950/40 p-6">
            <h2 className="text-xl font-semibold">Sessione finita</h2>
            <button
              type="button"
              onClick={() => setSession(undefined)}
              className="rounded-md bg-emerald-700 px-4 py-2 font-medium"
            >
              Torna ai finali
            </button>
          </div>
        </>
      )
    }
    const last = session.index === session.list.length - 1
    return (
      <>
        <PageHeader title="Finali">
          {session.list.length > 1
            ? `Esercizio ${session.index + 1} di ${session.list.length}`
            : undefined}
        </PageHeader>
        <EndgameTrainer
          key={`${current.id}|${session.index}`}
          endgame={current}
          onFirstResult={(ok) => void recordEndgame(db, current.id, ok)}
          onNext={() => setSession({ ...session, index: session.index + 1 })}
          nextLabel={last ? 'Fine' : 'Avanti'}
        />
        <button
          type="button"
          onClick={() => setSession(undefined)}
          className="mt-3 rounded-md bg-stone-800 px-3 py-1.5 text-sm"
        >
          Interrompi
        </button>
      </>
    )
  }

  const today = endgamesToday(progress, now)
  const categories = [...new Set(ENDGAMES.map((e) => e.category))]
  return (
    <>
      <PageHeader title="Finali">
        I finali che ogni giocatore deve saper giocare, contro il motore al massimo della forza.
        Tornano a intervalli crescenti come i ripassi.
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={today.length === 0}
          onClick={() => setSession({ list: today, index: 0 })}
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600 disabled:opacity-40"
        >
          Allenamento di oggi ({today.length})
        </button>
        {today.length === 0 && (
          <span className="text-sm text-stone-400">Per oggi hai finito: torna domani.</span>
        )}
      </div>
      <div className="space-y-6">
        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 font-medium text-stone-300">{cat}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ENDGAMES.filter((e) => e.category === cat).map((e) => {
                const st = endgameStatus(e.id, progress, now)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSession({ list: [e], index: 0 })}
                      className="w-full rounded-lg border border-stone-800 bg-stone-950/40 p-3 text-left transition-colors hover:border-stone-600"
                    >
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-stone-400">
                        {e.color === 'white' ? 'Bianco' : 'Nero'} · {GOAL_LABELS[e.goal]}
                      </div>
                      <div
                        className={`mt-1 text-xs ${
                          st.kind === 'due'
                            ? 'text-sky-400'
                            : st.kind === 'new'
                              ? 'text-stone-500'
                              : st.lastCorrect
                                ? 'text-emerald-400'
                                : 'text-red-300'
                        }`}
                      >
                        {st.kind === 'new'
                          ? 'Nuovo'
                          : st.kind === 'due'
                            ? 'Da ripassare'
                            : `${st.lastCorrect ? '✓ Riuscito' : '✗ Da rifare'} · prossimo ripasso tra ${Math.max(
                                1,
                                Math.round((st.due - now) / DAY),
                              )} g`}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
