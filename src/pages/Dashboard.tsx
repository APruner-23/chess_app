import { useEffect, useMemo, useState } from 'react'
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
import { PageHeader } from '../components/PageHeader'
import { SITE_LABELS } from '../components/accounts'
import { SPEED_LABELS, formatDate } from '../components/format'
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
import type { Site, Speed } from '../import/types'
import { openingKey, openingStats } from '../openings/stats'
import { isDue } from '../training/cards'

const tile = 'rounded-lg border border-stone-800 bg-stone-950/40 p-4'
const pawns = (v?: number) =>
  v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`

function Stat({
  label,
  value,
  sub,
  to,
}: {
  label: string
  value: string | number
  sub?: string
  to?: string
}) {
  const body = (
    <>
      <div className="text-sm text-stone-400">{label}</div>
      <div className="text-3xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </>
  )
  return to ? (
    <Link to={to} className={`${tile} block hover:border-stone-600`}>
      {body}
    </Link>
  ) : (
    <div className={tile}>{body}</div>
  )
}

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

export function Dashboard() {
  useEffect(() => {
    void processFeedback(db)
  }, [])
  const data = useLiveQuery(async () => ({
    games: await db.games.toArray(),
    analyses: await db.analyses.toArray(),
    exits: await db.feedback.where('status').equals('info').toArray(),
    openItems: await db.feedback.where('status').equals('open').toArray(),
    reps: new Map((await db.repertoires.toArray()).map((r) => [r.id, r])),
    cards: await db.cards.toArray(),
  }))
  const [chosen, setChosen] = useState<string>()
  const [now] = useState(() => Date.now())

  const derived = useMemo(() => {
    if (!data) return undefined
    const games = new Map(data.games.map((g) => [g.id, g]))
    const accuracy = new Map<string, number>()
    for (const a of data.analyses) {
      const g = games.get(a.id)
      const acc = g && userAccuracy(g, a)
      if (acc !== undefined) accuracy.set(a.id, acc)
    }
    const recent = data.games
      .filter((g) => accuracy.has(g.id))
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, 30)
    // Per site and speed: game count (for sorting) and the user's latest rating.
    const combos = new Map<string, { n: number; t: number; rating?: number }>()
    for (const g of data.games) {
      const key = `${g.site}|${g.speed}`
      const c = combos.get(key) ?? { n: 0, t: -Infinity }
      c.n++
      const rating = g[g.userColor].rating
      if (rating !== undefined && g.playedAt > c.t) Object.assign(c, { t: g.playedAt, rating })
      combos.set(key, c)
    }
    const openings = openingStats(data.games, 'family')
      .slice(0, 8)
      .map((s) => {
        const accs = data.games
          .filter((g) => openingKey(g, 'family') === s.name && accuracy.has(g.id))
          .map((g) => accuracy.get(g.id)!)
        return {
          ...s,
          accuracy: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : undefined,
        }
      })
    return {
      avgAccuracy: recent.length
        ? recent.reduce((a, g) => a + accuracy.get(g.id)!, 0) / recent.length
        : undefined,
      combos: [...combos.entries()].sort((a, b) => b[1].n - a[1].n),
      openings,
      study: (() => {
        const map = new Map<string, typeof data.openItems>()
        for (const f of data.openItems) map.set(groupKey(f), [...(map.get(groupKey(f)) ?? []), f])
        return [...map.values()].sort((a, b) => b.length - a.length).slice(0, 3)
      })(),
      lines: lineStats(data.exits, games, data.reps).slice(0, 10),
      vs: experimentalVsMain(data.exits, data.reps),
    }
  }, [data])

  if (!data || !derived) return <PageHeader title="Dashboard" />
  if (data.games.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <p className="text-stone-400">
          Inizia da{' '}
          <Link to="/partite" className="text-emerald-400 hover:underline">
            Partite
          </Link>
          : importa le tue partite da Chess.com e Lichess.
        </p>
      </>
    )
  }

  const combo = chosen ?? derived.combos[0]?.[0] ?? ''
  const [site, speed] = combo.split('|') as [Site, Speed]
  const series = ratingSeries(data.games, site, speed)
  const due = data.cards.filter((c) => isDue(c, now)).length

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Da ripassare" value={due} sub="posizioni in scadenza" to="/allenamento" />
        <Stat
          label="Feedback aperti"
          value={data.openItems.length}
          sub="dalle tue partite"
          to="/feedback"
        />
        <Stat
          label="Partite"
          value={data.games.length.toLocaleString('it-IT')}
          sub={`${data.analyses.length} analizzate`}
          to="/partite"
        />
        <Stat
          label="Accuratezza"
          value={derived.avgAccuracy !== undefined ? `${Math.round(derived.avgAccuracy)}%` : '—'}
          sub="media delle ultime 30 partite analizzate"
        />
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

      <section className={`${tile} mt-4`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Andamento del rating</h2>
          <select
            aria-label="Sito e cadenza"
            value={combo}
            onChange={(e) => setChosen(e.target.value)}
            className="rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-sm"
          >
            {derived.combos.map(([key, c]) => {
              const [s, sp] = key.split('|') as [Site, Speed]
              return (
                <option key={key} value={key}>
                  {SITE_LABELS[s]} · {SPEED_LABELS[sp]}
                  {c.rating !== undefined ? ` · ${c.rating}` : ''}
                </option>
              )
            })}
          </select>
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
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={tile}>
          <h2 className="mb-2 font-medium">Le tue aperture più giocate</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1">Apertura</th>
                <th className="text-right">Partite</th>
                <th className="text-right">Punteggio</th>
                <th className="text-right">Accuratezza</th>
              </tr>
            </thead>
            <tbody>
              {derived.openings.map((o) => (
                <tr key={o.name} className="border-t border-stone-800">
                  <td className="py-1">
                    <Link
                      to={`/partite?opening=${encodeURIComponent(o.name)}`}
                      className="hover:underline"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="text-right">{o.games}</td>
                  <td className="text-right">{o.score}%</td>
                  <td className="text-right">
                    {o.accuracy !== undefined ? `${Math.round(o.accuracy)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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
    </>
  )
}
