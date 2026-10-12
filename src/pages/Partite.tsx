import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { ImportPanel } from '../components/ImportPanel'
import { useAnalysisStore } from '../components/analysisStore'
import { SITE_LABELS } from '../components/accounts'
import {
  RESULT_COLORS,
  RESULT_LABELS,
  SPEED_LABELS,
  formatDate,
  formatTimeControl,
} from '../components/format'
import { PHASE_LABELS, endPhase } from '../chess/phase'
import { db } from '../db/schema'
import { filterGames, type GameFilter } from '../import/filter'
import type { Game } from '../import/types'
import { openingStats, type OpeningLevel } from '../openings/stats'

const PAGE = 100
const FILTER_KEYS = ['site', 'color', 'speed', 'result', 'opening'] as const

const selectClass = 'rounded-md border border-stone-700 bg-stone-950 px-2 py-1.5 text-sm'

export function Partite() {
  const games = useLiveQuery(() => db.games.orderBy('playedAt').reverse().toArray())
  const [params, setParams] = useSearchParams()
  const [shown, setShown] = useState(PAGE)
  const tab = params.get('vista') === 'aperture' ? 'aperture' : 'elenco'
  const level: OpeningLevel = params.get('livello') === 'variante' ? 'variation' : 'family'

  const filter = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, params.get(k) || undefined]),
  ) as GameFilter
  const filtered = useMemo(() => filterGames(games ?? [], filter), [games, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => openingStats(filtered, level), [filtered, level])

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setShown(PAGE)
  }

  const select = (
    key: (typeof FILTER_KEYS)[number],
    label: string,
    options: Record<string, string>,
  ) => (
    <select
      aria-label={label}
      value={params.get(key) ?? ''}
      onChange={(e) => setParam(key, e.target.value)}
      className={selectClass}
    >
      <option value="">{label}: tutti</option>
      {Object.entries(options).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <PageHeader title="Partite" />
      <ImportPanel />

      <div className="mb-4 flex flex-wrap gap-2">
        {select('site', 'Sito', SITE_LABELS)}
        {select('color', 'Colore', { white: 'Bianco', black: 'Nero' })}
        {select('speed', 'Cadenza', SPEED_LABELS)}
        {select('result', 'Risultato', RESULT_LABELS)}
        <input
          aria-label="Apertura"
          placeholder="Apertura o ECO"
          value={params.get('opening') ?? ''}
          onChange={(e) => setParam('opening', e.target.value)}
          className={`${selectClass} w-48`}
        />
      </div>

      <div className="mb-4 flex gap-1 border-b border-stone-800">
        {(['elenco', 'aperture'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setParam('vista', t === 'elenco' ? undefined : t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t ? 'border-emerald-500 text-white' : 'border-transparent text-stone-400'
            }`}
          >
            {t === 'elenco' ? `Elenco (${filtered.length})` : 'Statistiche per apertura'}
          </button>
        ))}
      </div>

      {games === undefined ? null : games.length === 0 ? (
        <p className="text-stone-400">Nessuna partita: premi “Importa partite”.</p>
      ) : tab === 'elenco' ? (
        <GameTable
          games={filtered.slice(0, shown)}
          more={filtered.length > shown}
          onMore={() => setShown(shown + PAGE)}
        />
      ) : (
        <>
          <div className="mb-3 flex gap-2 text-sm">
            {(['family', 'variation'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setParam('livello', l === 'family' ? undefined : 'variante')}
                className={`rounded-md px-3 py-1 ${level === l ? 'bg-stone-700' : 'bg-stone-800 text-stone-400'}`}
              >
                {l === 'family' ? 'Per apertura' : 'Per variante'}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-stone-400">
                <tr>
                  <th className="py-2 pr-3">Apertura</th>
                  <th className="pr-3">ECO</th>
                  <th className="pr-3 text-right">Partite</th>
                  <th className="pr-3 text-right">V / P / S</th>
                  <th className="pr-3">Risultati</th>
                  <th className="text-right">Punteggio</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.name} className="border-t border-stone-800">
                    <td className="max-w-64 truncate py-1.5 pr-3" title={s.name}>
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => {
                          const next = new URLSearchParams(params)
                          next.set('opening', s.name)
                          next.delete('vista')
                          setParams(next)
                        }}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="pr-3 text-stone-400">{s.eco}</td>
                    <td className="pr-3 text-right">{s.games}</td>
                    <td className="pr-3 text-right whitespace-nowrap">
                      {s.wins} / {s.draws} / {s.losses}
                    </td>
                    <td className="pr-3">
                      <ResultBar wins={s.wins} draws={s.draws} losses={s.losses} />
                    </td>
                    <td className="text-right">{s.score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses
  return (
    <div className="flex h-2 w-32 overflow-hidden rounded bg-stone-800">
      <div className="bg-emerald-500" style={{ width: `${(wins / total) * 100}%` }} />
      <div className="bg-stone-400" style={{ width: `${(draws / total) * 100}%` }} />
      <div className="bg-red-500" style={{ width: `${(losses / total) * 100}%` }} />
    </div>
  )
}

function GameTable({ games, more, onMore }: { games: Game[]; more: boolean; onMore: () => void }) {
  const navigate = useNavigate()
  const ids = games.map((g) => g.id)
  const analyzed = useLiveQuery(
    async () => new Set(await db.analyses.where('id').anyOf(ids).primaryKeys()),
    [ids.join(',')],
  )
  const phases = useMemo(() => new Map(games.map((g) => [g.id, endPhase(g.moves)])), [games])
  const progress = useAnalysisStore((s) => s.progress)
  const analyze = useAnalysisStore((s) => s.analyze)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-stone-400">
          <tr>
            <th className="w-8 py-2 pr-2" title="Analisi">
              <span className="sr-only">Analisi</span>
            </th>
            <th className="pr-3">Data</th>
            <th className="pr-3">Sito</th>
            <th className="pr-3">Avversario</th>
            <th className="pr-3">Risultato</th>
            <th className="pr-3">Cadenza</th>
            <th className="pr-3">Apertura</th>
            <th className="pr-3 text-right">Mosse</th>
            <th>Finita in</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const opp = g.userColor === 'white' ? g.black : g.white
            const p = progress[g.id]
            return (
              <tr
                key={g.id}
                onClick={() => navigate(`/partite/${encodeURIComponent(g.id)}`)}
                className="cursor-pointer border-t border-stone-800 hover:bg-stone-800/50"
              >
                <td className="pr-2 text-center">
                  {analyzed?.has(g.id) ? (
                    <span title="Analizzata" className="text-emerald-400">
                      ✓
                    </span>
                  ) : p !== undefined ? (
                    <span title="Analisi in corso" className="text-stone-400">
                      {Math.round(p * 100)}%
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Analizza con il motore"
                      aria-label="Analizza"
                      onClick={(e) => {
                        e.stopPropagation()
                        void analyze(g)
                      }}
                      className="rounded px-1.5 text-stone-500 hover:bg-stone-700 hover:text-white"
                    >
                      ▷
                    </button>
                  )}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(g.playedAt)}</td>
                <td className="pr-3 text-stone-400">{SITE_LABELS[g.site]}</td>
                <td className="pr-3 whitespace-nowrap">
                  <span className="mr-1">{g.userColor === 'white' ? '○' : '●'}</span>
                  {opp.name} <span className="text-stone-500">{opp.rating}</span>
                </td>
                <td className={`pr-3 ${RESULT_COLORS[g.result]}`}>{RESULT_LABELS[g.result]}</td>
                <td className="pr-3 whitespace-nowrap text-stone-400">
                  {SPEED_LABELS[g.speed]} {formatTimeControl(g.timeControl)}
                </td>
                <td className="max-w-64 truncate pr-3" title={g.openingName}>
                  {g.openingName ?? '—'}
                </td>
                <td className="pr-3 text-right text-stone-400">{Math.ceil(g.moves.length / 2)}</td>
                <td className="text-stone-400">{PHASE_LABELS[phases.get(g.id)!]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {more && (
        <button
          type="button"
          onClick={onMore}
          className="mt-3 rounded-md bg-stone-800 px-4 py-2 text-sm"
        >
          Mostra altre
        </button>
      )}
    </div>
  )
}
