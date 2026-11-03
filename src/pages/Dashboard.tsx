import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CoachList } from '../components/CoachList'
import { GoalCard } from '../components/GoalCard'
import { PageHeader } from '../components/PageHeader'
import { SITE_LABELS } from '../components/accounts'
import { SERIES } from '../components/chartColors'
import { RESULT_LABELS, SPEED_LABELS, formatDate } from '../components/format'
import { db } from '../db/schema'
import {
  experimentalVsMain,
  lineStats,
  ratingSeries,
  userAccuracy,
  type Aggregate,
} from '../feedback/stats'
import { processFeedback } from '../feedback/repo'
import { groupKey } from '../feedback/compareGame'
import { figurine } from '../chess/figurine'
import { coachReport } from '../coach/insights'
import type { GameResult, Site, Speed } from '../import/types'
import { rebuildPuzzles } from '../puzzles/repo'
import { puzzleStats } from '../puzzles/session'
import { ratingChange, scoreOf } from '../stats/games'
import { isDue } from '../training/cards'
import { DEFAULT_DAILY_GOAL, dailyTotals } from '../training/activity'
import { DAILY_GOAL_KEY } from '../training/activityRepo'
import { getSetting } from '../db/settings'

const tile = 'rounded-lg border border-stone-800 bg-stone-950/40 p-4'
const pawns = (v?: number) =>
  v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`
/** Recent games whose analysis is offered on the home page. */
const RECENT = 100

/** A thing to do today: a count, what it means, and where to go. */
function Todo({
  icon,
  label,
  value,
  sub,
  action,
  to,
  accent,
}: {
  icon: string
  label: string
  value: number
  sub: string
  action: string
  to: string
  accent: string
}) {
  const done = value === 0
  return (
    <Link
      to={to}
      className={`${tile} group flex flex-col transition-colors hover:border-stone-600 hover:bg-stone-900/60`}
    >
      <div className="flex items-center gap-2 text-sm text-stone-400">
        <span className={`text-lg leading-none ${done ? 'text-stone-600' : accent}`}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold ${done ? 'text-stone-500' : ''}`}>{value}</div>
      <div className="text-xs text-stone-500">{sub}</div>
      <div
        className={`mt-auto pt-3 text-sm font-medium ${done ? 'text-stone-500' : accent} group-hover:underline`}
      >
        {done ? 'Tutto fatto ✓' : `${action} →`}
      </div>
    </Link>
  )
}

const RESULT_DOT: Record<GameResult, string> = {
  win: 'bg-emerald-600 text-white',
  draw: 'bg-stone-500 text-white',
  loss: 'bg-red-600 text-white',
}
const RESULT_LETTER: Record<GameResult, string> = { win: 'V', draw: 'P', loss: 'S' }

function AggregateTile({ title, a }: { title: string; a: Aggregate }) {
  return (
    <div className={tile}>
      <div className="text-sm text-stone-400">{title}</div>
      {a.games === 0 ? (
        <div className="mt-1 text-stone-500">Nessuna partita</div>
      ) : (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
          <dt className="text-stone-400">Partite</dt>
          <dd>{a.games}</dd>
          <dt className="text-stone-400">Punteggio</dt>
          <dd>{a.score}%</dd>
          <dt className="text-stone-400">Mosse in libro</dt>
          <dd>{a.avgBookMoves.toFixed(1)}</dd>
          <dt className="text-stone-400">Valutazione all'uscita</dt>
          <dd>{pawns(a.avgExit)}</dd>
        </dl>
      )}
    </div>
  )
}

function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

function Card({
  title,
  children,
  right,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className={tile}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Dashboard() {
  useEffect(() => {
    void processFeedback(db)
    void rebuildPuzzles(db)
  }, [])
  const data = useLiveQuery(async () => ({
    games: await db.games.toArray(),
    analyses: await db.analyses.toArray(),
    exits: await db.feedback.where('status').equals('info').toArray(),
    openItems: await db.feedback.where('status').equals('open').toArray(),
    reps: new Map((await db.repertoires.toArray()).map((r) => [r.id, r])),
    cards: await db.cards.toArray(),
    puzzles: await db.puzzles.toArray(),
    puzzleProgress: await db.puzzleProgress.toArray(),
    activity: await db.activity.toArray(),
    goal: await getSetting(db, DAILY_GOAL_KEY, DEFAULT_DAILY_GOAL),
  }))
  const [chosen, setChosen] = useState<string>()
  const [now] = useState(() => Date.now())

  const derived = useMemo(() => {
    if (!data) return undefined
    const games = new Map(data.games.map((g) => [g.id, g]))
    const analyzed = new Set(data.analyses.map((a) => a.id))
    const accuracy = new Map<string, number>()
    for (const a of data.analyses) {
      const g = games.get(a.id)
      const acc = g && userAccuracy(g, a)
      if (acc !== undefined) accuracy.set(a.id, acc)
    }
    const byDate = [...data.games].sort((a, b) => b.playedAt - a.playedAt)
    // Per site and speed: game count (for sorting), latest rating and its 30-day change.
    const combos = new Map<string, { n: number; rating?: number; change?: number }>()
    for (const g of data.games) {
      const key = `${g.site}|${g.speed}`
      combos.set(key, { n: (combos.get(key)?.n ?? 0) + 1 })
    }
    for (const [key, c] of combos) {
      const [site, speed] = key.split('|') as [Site, Speed]
      const series = ratingSeries(data.games, site, speed)
      c.rating = series.at(-1)?.rating
      c.change = ratingChange(series, now)
    }
    const form = byDate.slice(0, 20)
    return {
      accuracy,
      combos: [...combos.entries()].sort((a, b) => b[1].n - a[1].n),
      recent: byDate.slice(0, 5),
      form,
      formScore: scoreOf(form.map((g) => g.result)),
      toAnalyze: byDate.slice(0, RECENT).filter((g) => !analyzed.has(g.id)).length,
      puzzles: puzzleStats(data.puzzles, new Map(data.puzzleProgress.map((p) => [p.id, p])), now),
      study: (() => {
        const map = new Map<string, typeof data.openItems>()
        for (const f of data.openItems) map.set(groupKey(f), [...(map.get(groupKey(f)) ?? []), f])
        return [...map.values()].sort((a, b) => b.length - a.length).slice(0, 3)
      })(),
      lines: lineStats(data.exits, games, data.reps).slice(0, 10),
      coach: coachReport({
        games: data.games,
        analyses: new Map(data.analyses.map((a) => [a.id, a])),
        puzzles: data.puzzles,
        exits: data.exits,
        reps: data.reps,
        openFeedback: data.openItems.length,
        now,
      }),
      vs: experimentalVsMain(data.exits, data.reps),
    }
  }, [data, now])

  if (!data || !derived) return <PageHeader title="Home" />
  if (data.games.length === 0) {
    return (
      <>
        <PageHeader title={greeting(now)}>Benvenuto nella tua app di scacchi.</PageHeader>
        <div className={`${tile} max-w-xl space-y-2`}>
          <p>Per cominciare:</p>
          <ol className="list-decimal space-y-1 pl-5 text-stone-300">
            <li>
              importa le tue partite da Chess.com e Lichess in{' '}
              <Link to="/partite" className="text-emerald-400 hover:underline">
                Partite
              </Link>
              ;
            </li>
            <li>
              crea un repertorio di aperture in{' '}
              <Link to="/repertori" className="text-emerald-400 hover:underline">
                Repertori
              </Link>
              ;
            </li>
            <li>allenati ogni giorno qualche minuto in Allenamento.</li>
          </ol>
        </div>
      </>
    )
  }

  const combo = chosen ?? derived.combos[0]?.[0] ?? ''
  const [site, speed] = combo.split('|') as [Site, Speed]
  const series = ratingSeries(data.games, site, speed)
  const due = data.cards.filter((c) => isDue(c, now)).length
  const puzzleTodo = derived.puzzles.due + derived.puzzles.newToday

  return (
    <>
      <PageHeader title={greeting(now)}>Ecco cosa c'è da fare oggi.</PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Todo
          icon="♗"
          label="Ripassi"
          value={due}
          sub="posizioni dei repertori in scadenza"
          action="Ripassa"
          to="/allenamento"
          accent="text-sky-400"
        />
        <Todo
          icon="✦"
          label="Puzzle"
          value={puzzleTodo}
          sub="dai tuoi errori, da ripassare o nuovi"
          action="Risolvi"
          to={puzzleTodo ? '/puzzle?mode=review' : '/allenamento'}
          accent="text-violet-400"
        />
        <Todo
          icon="♖"
          label="Feedback"
          value={data.openItems.length}
          sub="deviazioni e buchi nei repertori"
          action="Guarda"
          to="/feedback"
          accent="text-amber-400"
        />
        <Todo
          icon={'♟\uFE0E'}
          label="Da analizzare"
          value={derived.toAnalyze}
          sub={`tra le ultime ${Math.min(RECENT, data.games.length)} partite`}
          action="Analizza"
          to="/partite"
          accent="text-emerald-400"
        />
      </div>

      <div className="mt-4">
        <GoalCard totals={dailyTotals(data.activity)} goal={data.goal} now={now} />
      </div>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Il tuo coach: su cosa lavorare</h2>
          <Link to="/statistiche#coach" className="text-sm text-emerald-400 hover:underline">
            Tutti i consigli →
          </Link>
        </div>
        <CoachList report={derived.coach} limit={3} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Rating">
            <div
              className="mb-3 flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Sito e cadenza"
            >
              {derived.combos.map(([key, c]) => {
                const [s, sp] = key.split('|') as [Site, Speed]
                const active = key === combo
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChosen(key)}
                    className={`shrink-0 rounded-md border px-3 py-1.5 text-left transition-colors ${
                      active
                        ? 'border-stone-500 bg-stone-800'
                        : 'border-stone-800 hover:border-stone-600'
                    }`}
                  >
                    <div className="text-xs text-stone-400">
                      {SITE_LABELS[s]} · {SPEED_LABELS[sp]}
                    </div>
                    <div className="font-semibold">
                      {c.rating ?? '—'}
                      {c.change !== undefined && c.change !== 0 && (
                        <span
                          className={`ml-1.5 text-xs font-normal ${c.change > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                          title="Variazione negli ultimi 30 giorni"
                        >
                          {c.change > 0 ? '▲' : '▼'} {Math.abs(c.change)}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {series.length < 2 ? (
              <p className="text-sm text-stone-500">Servono almeno due partite con rating.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#292524" vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(t: number) => {
                        // Short ranges show day and month, long ones month and year.
                        const short = series[series.length - 1]!.t - series[0]!.t < 120 * 86_400_000
                        return new Date(t).toLocaleDateString(
                          'it-IT',
                          short
                            ? { day: 'numeric', month: 'short' }
                            : { month: 'short', year: '2-digit' },
                        )
                      }}
                      stroke="#78716c"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      stroke="#78716c"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as { t: number; rating: number } | undefined
                        return active && p ? (
                          <div className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs">
                            {formatDate(p.t)} · {p.rating}
                          </div>
                        ) : null
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="rating"
                      stroke={SERIES.user}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Forma recente"
          right={
            <span className="text-sm text-stone-400">
              {derived.formScore.score !== undefined &&
                `${Math.round(derived.formScore.score * 100)}% nelle ultime ${derived.form.length}`}
            </span>
          }
        >
          <div
            className="flex flex-wrap gap-1"
            aria-label="Risultati delle ultime partite, dalla più recente"
          >
            {derived.form.map((g) => (
              <Link
                key={g.id}
                to={`/partite/${encodeURIComponent(g.id)}`}
                title={`${RESULT_LABELS[g.result]} · ${formatDate(g.playedAt)}`}
                className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold ${RESULT_DOT[g.result]} hover:opacity-80`}
              >
                {RESULT_LETTER[g.result]}
              </Link>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-stone-800 text-sm">
            {derived.recent.map((g) => {
              const opp = g.userColor === 'white' ? g.black : g.white
              const acc = derived.accuracy.get(g.id)
              return (
                <li key={g.id}>
                  <Link
                    to={`/partite/${encodeURIComponent(g.id)}`}
                    className="-mx-2 flex items-center gap-2 rounded px-2 py-1.5 hover:bg-stone-800/60"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${RESULT_DOT[g.result].split(' ')[0]}`}
                      aria-label={RESULT_LABELS[g.result]}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {g.userColor === 'white' ? '○' : '●'} {opp.name}
                      {opp.rating ? <span className="text-stone-500"> {opp.rating}</span> : null}
                      <span className="block truncate text-xs text-stone-500">
                        {g.openingName ?? 'Apertura sconosciuta'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-stone-500">
                      {formatDate(g.playedAt)}
                      {acc !== undefined && <span className="block">{Math.round(acc)}%</span>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link
            to="/partite"
            className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
          >
            Tutte le partite →
          </Link>
        </Card>
      </div>

      {derived.study.length > 0 && (
        <section className={`${tile} mt-4`}>
          <h2 className="mb-2 font-medium">Da studiare</h2>
          <ul className="space-y-1 text-sm">
            {derived.study.map((items) => {
              const f = items[0]!
              const what =
                f.kind === 'hole'
                  ? `prepara una risposta a ${figurine(f.san!)}`
                  : f.kind === 'deviation'
                    ? `ripassa ${figurine(f.expectedSan!)} (hai giocato ${figurine(f.san!)})`
                    : `allunga la linea con ${figurine(f.bestSan!)}`
              return (
                <li key={groupKey(f)}>
                  <Link to="/feedback" className="hover:underline">
                    <span className="text-stone-400">
                      {f.path.length
                        ? `dopo ${f.path.map(figurine).join(' ')}: `
                        : 'alla prima mossa: '}
                    </span>
                    {what}
                  </Link>{' '}
                  <span className="text-stone-500">
                    ({items.length} {items.length === 1 ? 'partita' : 'partite'})
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-4">
        <section className={tile}>
          <h2 className="mb-2 font-medium">Le linee dei tuoi repertori</h2>
          {derived.lines.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nessuna partita è ancora passata per un tuo repertorio. Creane uno in{' '}
              <Link to="/repertori" className="text-emerald-400 hover:underline">
                Repertori
              </Link>
              .
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1">Linea</th>
                  <th className="text-right">Partite</th>
                  <th className="text-right">Punteggio</th>
                  <th
                    className="text-right"
                    title="Valutazione media quando finisce la preparazione, dal tuo punto di vista"
                  >
                    All'uscita
                  </th>
                </tr>
              </thead>
              <tbody>
                {derived.lines.map((l) => (
                  <tr key={`${l.repertoireId}|${l.name}`} className="border-t border-stone-800">
                    <td className="py-1">
                      <div>{l.name}</div>
                      <div className="text-xs text-stone-500">
                        {data.reps.get(l.repertoireId)?.name} · {l.avgBookMoves.toFixed(1)} mosse in
                        libro
                      </div>
                    </td>
                    <td className="text-right">{l.games}</td>
                    <td className="text-right">{l.score}%</td>
                    <td className="text-right">{pawns(l.avgExit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {[...data.reps.values()].some((r) => r.experimental) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <AggregateTile title="Repertori sperimentali" a={derived.vs.experimental} />
          <AggregateTile title="Repertori principali" a={derived.vs.main} />
        </div>
      )}

      <p className="mt-4 text-sm">
        <Link to="/statistiche" className="text-emerald-400 hover:underline">
          Altre statistiche: tempo, errori per fase, aperture →
        </Link>
      </p>
    </>
  )
}
