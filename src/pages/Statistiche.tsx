import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bars, MonthLine } from '../components/charts'
import { SERIES } from '../components/chartColors'
import { CoachList } from '../components/CoachList'
import { PageHeader } from '../components/PageHeader'
import { SPEED_LABELS } from '../components/format'
import { PHASE_LABELS } from '../chess/phase'
import { coachReport } from '../coach/insights'
import { db } from '../db/schema'
import type { Analysis, Color, Speed } from '../import/types'
import { openingStats } from '../openings/stats'
import {
  END_LABELS,
  endings,
  filterGames,
  scoreAfterResult,
  scoreByDayPart,
  scoreByRatingGap,
  scoreOf,
  type Score,
} from '../stats/games'
import { errorsByPhase, timeStats } from '../stats/time'
import { monthlyProgress, startMonth, trend, type ProgressKey } from '../stats/progress'

const tile = 'rounded-lg border border-stone-800 bg-stone-950/40 p-4'
const field = 'rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-sm'
const pct = (v?: number, digits = 0) => (v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`)
const PROGRESS: {
  key: ProgressKey
  label: string
  format: (v: number) => string
  higherIsBetter: boolean
  /** Changes smaller than this are not called better or worse. */
  noise: number
  domain?: [number | 'auto', number | 'auto']
}[] = [
  {
    key: 'score',
    label: 'Punteggio',
    format: (v) => pct(v),
    higherIsBetter: true,
    noise: 0.03,
    domain: [0, 1],
  },
  {
    key: 'accuracy',
    label: 'Accuratezza (partite analizzate)',
    format: (v) => `${Math.round(v)}%`,
    higherIsBetter: true,
    noise: 2,
  },
  {
    key: 'errorsPer100',
    label: 'Errori ogni 100 mosse',
    format: (v) => v.toFixed(1),
    higherIsBetter: false,
    noise: 0.5,
    domain: [0, 'auto'],
  },
  {
    key: 'timeLosses',
    label: 'Partite perse per tempo',
    format: (v) => pct(v),
    higherIsBetter: false,
    noise: 0.02,
    domain: [0, 'auto'],
  },
  {
    key: 'inBook',
    label: 'Partite dentro un tuo repertorio',
    format: (v) => pct(v),
    higherIsBetter: true,
    noise: 0.03,
    domain: [0, 1],
  },
]

const PERIODS: [string, string][] = [
  ['3', 'Ultimi 3 mesi'],
  ['12', 'Ultimi 12 mesi'],
  ['', 'Tutto'],
]

function Section({
  title,
  children,
  note,
}: {
  title: string
  children: ReactNode
  note?: ReactNode
}) {
  return (
    <section className={tile}>
      <h2 className="font-medium">{title}</h2>
      {note && <p className="mb-2 text-xs text-stone-500">{note}</p>}
      <div className={note ? '' : 'mt-2'}>{children}</div>
    </section>
  )
}

function Big({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-md bg-stone-900/60 p-3">
      <div className="text-xs text-stone-400">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  )
}

const scoreSub = (s: Score) => `${s.games} partite · +${s.wins} =${s.draws} −${s.losses}`

/**
 * Deeper statistics on the user's games: time use against opponents, errors by phase,
 * results by rating gap, time of day and previous result, openings by color.
 */
export function Statistiche() {
  const [params] = useSearchParams()
  const data = useLiveQuery(async () => ({
    games: await db.games.toArray(),
    analyses: await db.analyses.toArray(),
    puzzles: await db.puzzles.toArray(),
    exits: await db.feedback.where('status').equals('info').toArray(),
    openFeedback: await db.feedback.where('status').equals('open').count(),
    firstReview: (await db.reviewLogs.orderBy('reviewedAt').first())?.reviewedAt,
    reps: new Map((await db.repertoires.toArray()).map((r) => [r.id, r])),
  }))
  const [speed, setSpeed] = useState<Speed | '' | undefined>(
    () => (params.get('speed') as Speed | null) ?? undefined,
  )
  const [months, setMonths] = useState('12')
  const [now] = useState(() => Date.now())

  // Default cadence: the most played one.
  const speeds = useMemo(() => {
    const n = new Map<Speed, number>()
    for (const g of data?.games ?? []) n.set(g.speed, (n.get(g.speed) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [data])
  const sp = speed ?? speeds[0] ?? ''

  const stats = useMemo(() => {
    if (!data) return undefined
    const games = filterGames(
      data.games,
      { ...(sp ? { speed: sp } : {}), ...(months ? { months: Number(months) } : {}) },
      now,
    )
    const analyses = new Map<string, Analysis>(data.analyses.map((a) => [a.id, a]))
    const analyzed = games.filter((g) => analyses.has(g.id)).length
    // Training starts with the first repertoire or the first review, whichever came first.
    const firstTraining = Math.min(
      ...[...data.reps.values()].map((r) => r.createdAt),
      data.firstReview ?? Infinity,
    )
    return {
      progress: monthlyProgress(
        sp ? data.games.filter((g) => g.speed === sp) : data.games,
        analyses,
        data.exits,
      ),
      start: startMonth(Number.isFinite(firstTraining) ? firstTraining : undefined),
      coach: coachReport({
        games: data.games,
        analyses,
        puzzles: data.puzzles,
        exits: data.exits,
        reps: data.reps,
        openFeedback: data.openFeedback,
        now,
      }),
      games,
      analyzed,
      total: scoreOf(games.map((g) => g.result)),
      time: timeStats(games, analyses),
      phases: errorsByPhase(games, analyses),
      ends: endings(games),
      gaps: scoreByRatingGap(games),
      parts: scoreByDayPart(games),
      tilt: scoreAfterResult(games),
      openings: (['white', 'black'] as Color[]).map((c) =>
        openingStats(
          games.filter((g) => g.userColor === c),
          'family',
        ).slice(0, 8),
      ),
    }
  }, [data, sp, months, now])

  if (!data || !stats) return <PageHeader title="Statistiche" />
  if (data.games.length === 0)
    return (
      <>
        <PageHeader title="Statistiche" />
        <p className="text-stone-400">
          Nessuna partita: importale in{' '}
          <Link to="/partite" className="underline">
            Partite
          </Link>
          .
        </p>
      </>
    )

  const { time } = stats
  const zeitRatio =
    time.zeitnot.normal && time.zeitnot.trouble
      ? time.zeitnot.trouble / time.zeitnot.normal
      : undefined

  return (
    <>
      <PageHeader title="Statistiche">
        Come usi il tempo, dove sbagli e contro chi rendi di più.
      </PageHeader>

      <section id="coach" className="mb-8 scroll-mt-4">
        <h2 className="text-lg font-semibold">Cosa migliorare</h2>
        <p className="mb-3 text-sm text-stone-400">
          Il coach guarda le tue partite degli ultimi 12 mesi ({stats.coach.games}, di cui{' '}
          {stats.coach.analyzed} analizzate) e mette in cima quello che ti costa più punti.
        </p>
        <CoachList report={stats.coach} />
      </section>

      <h2 className="mb-2 text-lg font-semibold">Statistiche dettagliate</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          aria-label="Cadenza"
          value={sp}
          onChange={(e) => setSpeed(e.target.value as Speed | '')}
          className={field}
        >
          {speeds.map((s) => (
            <option key={s} value={s}>
              {SPEED_LABELS[s]}
            </option>
          ))}
          <option value="">Tutte le cadenze</option>
        </select>
        <select
          aria-label="Periodo"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          className={field}
        >
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {stats.games.length === 0 ? (
        <p className="text-stone-400">Nessuna partita con questi filtri.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Big label="Partite" value={stats.games.length} sub={`${stats.analyzed} analizzate`} />
            <Big label="Punteggio" value={pct(stats.total.score)} sub={scoreSub(stats.total)} />
            <Big
              label="Perse per tempo"
              value={time.losses ? pct(time.lostOnTime / time.losses) : '—'}
              sub={`${time.lostOnTime} su ${time.losses} sconfitte`}
            />
            <Big
              label="Vinte per tempo"
              value={time.wonOnTime}
              sub={`su ${stats.total.wins} vittorie`}
            />
          </div>

          {stats.progress.length >= 2 && (
            <Section
              title="Stai migliorando?"
              note="Mese per mese, con la cadenza scelta (il periodo qui non si applica). Il confronto è tra gli ultimi 3 mesi e i 3 precedenti."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {PROGRESS.map((p) => {
                  const t = trend(stats.progress, p.key)
                  const better = t && (p.higherIsBetter ? t.recent > t.before : t.recent < t.before)
                  const marker = stats.progress.find((r) => r.month === stats.start)
                  return (
                    <div key={p.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-stone-300">{p.label}</span>
                        {t && Math.abs(t.recent - t.before) > p.noise && (
                          <span
                            className={`text-xs ${better ? 'text-emerald-400' : 'text-red-300'}`}
                          >
                            {better ? '▲ meglio' : '▼ peggio'}: {p.format(t.before)} →{' '}
                            {p.format(t.recent)}
                          </span>
                        )}
                      </div>
                      <MonthLine
                        data={stats.progress as unknown as Record<string, unknown>[]}
                        dataKey={p.key}
                        format={p.format}
                        color={SERIES.user}
                        {...(p.domain ? { domain: p.domain } : {})}
                        {...(marker ? { marker: { at: marker.label, text: 'inizio app' } } : {})}
                      />
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {time.games > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Secondi per mossa"
                note={`Media per fascia di mosse, su ${time.games} partite con orologio.`}
              >
                <Bars
                  data={time.perMove}
                  x="bucket"
                  series={[
                    { key: 'user', label: 'Tu', color: SERIES.user },
                    { key: 'opp', label: 'Avversari', color: SERIES.opp },
                  ]}
                  format={(v) => `${v.toFixed(1)} s`}
                />
              </Section>
              <Section
                title="Tempo rimasto"
                note="Quota del tempo iniziale rimasta dopo la mossa indicata."
              >
                <Bars
                  data={time.clockLeft.map((c) => ({ ...c, label: `Mossa ${c.move}` }))}
                  x="label"
                  series={[
                    { key: 'user', label: 'Tu', color: SERIES.user },
                    { key: 'opp', label: 'Avversari', color: SERIES.opp },
                  ]}
                  format={(v) => pct(v)}
                />
              </Section>
            </div>
          )}

          {time.games > 0 && stats.analyzed > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Errori e tempo di riflessione"
                note="Errori ed errori gravi ogni 100 mosse, secondo quanto hai pensato (in proporzione al tempo iniziale: istantanea < 1%, rapida 1–3%, normale 3–8%, lunga ≥ 8%). Solo partite analizzate, dalla sesta mossa."
              >
                <Bars
                  data={time.errorsByThink.filter((b) => b.rate !== undefined)}
                  x="bucket"
                  series={[{ key: 'rate', label: 'Errori ogni 100 mosse', color: SERIES.user }]}
                  format={(v) => (v * 100).toFixed(1)}
                  extra={(r) => `${r.moves as number} mosse`}
                />
              </Section>
              <Section title="Zeitnot" note="Quando ti resta meno del 10% del tempo iniziale.">
                <div className="grid grid-cols-2 gap-3">
                  <Big
                    label="Errori ogni 100 mosse"
                    value={
                      time.zeitnot.trouble !== undefined
                        ? (time.zeitnot.trouble * 100).toFixed(1)
                        : '—'
                    }
                    sub={`in zeitnot (${time.zeitnot.troubleMoves} mosse) contro ${
                      time.zeitnot.normal !== undefined
                        ? (time.zeitnot.normal * 100).toFixed(1)
                        : '—'
                    } normalmente`}
                  />
                  <Big
                    label="Punteggio"
                    value={pct(time.lowClock.low.score)}
                    sub={`nelle ${time.lowClock.low.games} partite in cui sei finito in zeitnot, contro ${pct(
                      time.lowClock.ok.score,
                    )} nelle altre`}
                  />
                </div>
                {zeitRatio !== undefined && zeitRatio > 1.2 && (
                  <p className="mt-3 text-sm text-stone-300">
                    In zeitnot sbagli circa {zeitRatio.toFixed(1)} volte più spesso: conviene
                    spendere meno tempo nelle prime mosse (vedi il grafico dei secondi per mossa).
                  </p>
                )}
              </Section>
            </div>
          )}

          {stats.analyzed > 0 && (
            <Section
              title="Errori per fase"
              note={`Le tue mosse nelle ${stats.analyzed} partite analizzate. La perdita media è quanta probabilità di vittoria regali a ogni mossa.`}
            >
              <div className="grid grid-cols-3 gap-3">
                {stats.phases.map((p) => (
                  <Big
                    key={p.phase}
                    label={PHASE_LABELS[p.phase]}
                    value={p.errorsPer100 !== undefined ? p.errorsPer100.toFixed(1) : '—'}
                    sub={
                      p.moves
                        ? `errori ogni 100 mosse · ${p.blunders} ${p.blunders === 1 ? 'grave' : 'gravi'} · perdita media ${p.avgLoss!.toFixed(1)}%`
                        : 'nessuna mossa'
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Punteggio per differenza di Elo"
              note="Elo dell'avversario meno il tuo. La linea tratteggiata è il 50%."
            >
              <Bars
                data={stats.gaps.map((g) => ({
                  label: g.label,
                  score: g.s.score,
                  games: g.s.games,
                }))}
                x="label"
                series={[{ key: 'score', label: 'Punteggio', color: SERIES.user }]}
                format={(v) => pct(v)}
                reference={0.5}
                extra={(r) => `${r.games as number} partite`}
              />
            </Section>
            <Section title="Come finiscono le partite">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr>
                    <th className="py-1 font-normal">Fine</th>
                    <th className="text-right font-normal">Vinte</th>
                    <th className="text-right font-normal">Perse</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.ends.map((e) => (
                    <tr key={e.kind} className="border-t border-stone-800">
                      <td className="py-1">{END_LABELS[e.kind]}</td>
                      <td className="text-right">{e.wins}</td>
                      <td className="text-right">{e.losses}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-stone-800 text-stone-400">
                    <td className="py-1">Patte</td>
                    <td className="text-right" colSpan={2}>
                      {stats.total.draws}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Quando giochi meglio" note="Punteggio per fascia oraria.">
              <Bars
                data={stats.parts
                  .filter((p) => p.s.games > 0)
                  .map((p) => ({
                    label: p.label.split(' ')[0],
                    full: p.label,
                    score: p.s.score,
                    games: p.s.games,
                  }))}
                x="label"
                series={[{ key: 'score', label: 'Punteggio', color: SERIES.user }]}
                format={(v) => pct(v)}
                reference={0.5}
                extra={(r) => `${r.full as string} · ${r.games as number} partite`}
              />
            </Section>
            <Section
              title="Dopo una sconfitta"
              note="Punteggio secondo com'è finita la partita precedente (entro un'ora)."
            >
              <div className="grid grid-cols-2 gap-3">
                <Big
                  label="Prima della sessione"
                  value={pct(stats.tilt.first.score)}
                  sub={scoreSub(stats.tilt.first)}
                />
                <Big
                  label="Dopo una vittoria"
                  value={pct(stats.tilt.win.score)}
                  sub={scoreSub(stats.tilt.win)}
                />
                <Big
                  label="Dopo una patta"
                  value={pct(stats.tilt.draw.score)}
                  sub={scoreSub(stats.tilt.draw)}
                />
                <Big
                  label="Dopo una sconfitta"
                  value={pct(stats.tilt.loss.score)}
                  sub={scoreSub(stats.tilt.loss)}
                />
              </div>
              {stats.tilt.loss.games >= 10 &&
                stats.tilt.loss.score! < (stats.total.score ?? 0) - 0.05 && (
                  <p className="mt-3 text-sm text-stone-300">
                    Dopo una sconfitta rendi meno del solito: forse conviene una pausa prima della
                    partita successiva.
                  </p>
                )}
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {stats.openings.map((rows, i) => (
              <Section key={i} title={`Aperture col ${i === 0 ? 'Bianco' : 'Nero'}`}>
                <table className="w-full text-sm">
                  <thead className="text-left text-stone-500">
                    <tr>
                      <th className="py-1 font-normal">Apertura</th>
                      <th className="text-right font-normal">Partite</th>
                      <th className="text-right font-normal">Punteggio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
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
                        <td className="text-right">{Math.round(o.score)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
