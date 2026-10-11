import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Board } from '../components/Board'
import { EvalBar } from '../components/EvalBar'
import { EvalGraph } from '../components/EvalGraph'
import { EnginePanel } from '../components/EnginePanel'
import { SITE_LABELS } from '../components/accounts'
import { useAnalysisStore } from '../components/analysisStore'
import { RESULT_COLORS, RESULT_LABELS, SPEED_LABELS, formatDate } from '../components/format'
import { JUDGMENT_LABELS, JUDGMENT_SYMBOLS, summarize } from '../analysis/summary'
import type { Judgment } from '../analysis/judgments'
import { INITIAL_EVAL } from '../analysis/winPercent'
import { figurine } from '../chess/figurine'
import { replaySan } from '../chess/position'
import { db } from '../db/schema'
import type { Analysis, Game } from '../import/types'

const JUDGMENT_TEXT: Record<Judgment, string> = {
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-400',
}

/** Game review: board with eval bar, eval graph, judged moves and live engine. */
export function Partita() {
  const { id = '' } = useParams()
  // null = not in the database; undefined = still loading
  const data = useLiveQuery(
    async () => ({ game: (await db.games.get(id)) ?? null, analysis: await db.analyses.get(id) }),
    [id],
  )
  if (data === undefined) return null
  if (data.game === null) return <p>Partita non trovata.</p>
  // Keyed so the position resets to the final move when another game opens.
  return <Review key={data.game.id} game={data.game} analysis={data.analysis} />
}

function Review({ game, analysis }: { game: Game; analysis?: Analysis }) {
  const replay = useMemo(() => replaySan(game.moves), [game])
  const summary = useMemo(() => (analysis ? summarize(analysis) : undefined), [analysis])
  const progress = useAnalysisStore((s) => s.progress[game.id])
  const analyze = useAnalysisStore((s) => s.analyze)
  const last = game.moves.length
  const [ply, setPly] = useState(last)
  const [best, setBest] = useState<string>()
  const onBest = useCallback((uci?: string) => setBest(uci), [])

  const go = useCallback((p: number) => setPly(Math.max(0, Math.min(last, p))), [last])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(last, p + 1))
      else if (e.key === 'Home') setPly(0)
      else if (e.key === 'End') setPly(last)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  const evals = analysis?.plies.map((p) => p.eval)
  const currentEval = ply === 0 ? INITIAL_EVAL : evals?.[ply - 1]
  // The user's next judged move after the current position.
  const nextMistake = summary
    ? [...summary.advices.values()].find((a) => a.color === game.userColor && a.ply + 1 > ply)
    : undefined

  const btn = 'rounded-md bg-stone-800 px-4 py-2 hover:bg-stone-700 disabled:opacity-40'
  return (
    <>
      <Link to="/partite" className="text-sm text-stone-400 hover:underline">
        ← Partite
      </Link>
      <h1 className="mt-2 text-xl font-semibold">
        {game.white.name} ({game.white.rating}) – {game.black.name} ({game.black.rating})
      </h1>
      <p className="mb-4 text-sm text-stone-400">
        <span className={RESULT_COLORS[game.result]}>{RESULT_LABELS[game.result]}</span> ·{' '}
        {SPEED_LABELS[game.speed]} {game.timeControl} · {formatDate(game.playedAt)} · {game.eco}{' '}
        {game.openingName} ·{' '}
        <a href={game.url} target="_blank" rel="noreferrer" className="hover:underline">
          apri su {SITE_LABELS[game.site]}
        </a>
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full max-w-[min(100%,580px)]">
          <div className="flex gap-2">
            <EvalBar value={currentEval} orientation={game.userColor} />
            <div className="min-w-0 flex-1">
              <Board
                fen={replay.fens[ply]!}
                orientation={game.userColor}
                lastMove={ply > 0 ? replay.ucis[ply - 1] : undefined}
                arrows={best ? [best] : undefined}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => go(0)}
              disabled={ply === 0}
              aria-label="Inizio"
            >
              ⏮
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => go(ply - 1)}
              disabled={ply === 0}
              aria-label="Indietro"
            >
              ◀
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => go(ply + 1)}
              disabled={ply === last}
              aria-label="Avanti"
            >
              ▶
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => go(last)}
              disabled={ply === last}
              aria-label="Fine"
            >
              ⏭
            </button>
            {summary && (
              <button
                type="button"
                className={btn}
                disabled={!nextMistake}
                onClick={() => nextMistake && go(nextMistake.ply + 1)}
              >
                Prossimo errore
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <EnginePanel fen={replay.fens[ply]!} onBest={onBest} />

          {summary && evals ? (
            <>
              <EvalGraph
                evals={evals}
                moves={game.moves}
                advices={summary.advices}
                ply={ply}
                onSelect={go}
              />
              <table className="text-sm">
                <thead className="text-stone-400">
                  <tr>
                    <th className="text-left font-normal">
                      {analysis!.source === 'lichess' ? 'Analisi di Lichess' : 'Analisi locale'}
                    </th>
                    <th className="font-normal">Bianco</th>
                    <th className="font-normal">Nero</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Accuratezza</td>
                    {(['white', 'black'] as const).map((c) => (
                      <td key={c} className="text-center font-semibold">
                        {summary.accuracy[c] !== undefined
                          ? `${Math.round(summary.accuracy[c])}%`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  {(['inaccuracy', 'mistake', 'blunder'] as const).map((j) => (
                    <tr key={j}>
                      <td className={JUDGMENT_TEXT[j]}>
                        {JUDGMENT_LABELS[j]} ({JUDGMENT_SYMBOLS[j]})
                      </td>
                      <td className="text-center">{summary.counts.white[j]}</td>
                      <td className="text-center">{summary.counts.black[j]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="rounded-lg bg-stone-950/40 p-3 text-sm">
              {progress !== undefined ? (
                <>
                  <p>Analisi in corso… {Math.round(progress * 100)}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-stone-800">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => analyze(game)}
                  className="rounded-md bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600"
                >
                  Analizza partita
                </button>
              )}
            </div>
          )}

          <ol className="grid max-h-[420px] grid-cols-[3rem_1fr_1fr] content-start overflow-y-auto rounded-lg bg-stone-950/40 p-2 text-sm">
            {Array.from({ length: Math.ceil(last / 2) }, (_, i) => (
              <li key={i} className="contents">
                <span className="py-1 pr-2 text-right text-stone-500">{i + 1}.</span>
                {[2 * i, 2 * i + 1].map((p) => {
                  if (p >= last) return <span key={p} />
                  const advice = summary?.advices.get(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => go(p + 1)}
                      className={`rounded px-2 py-1 text-left ${ply === p + 1 ? 'bg-emerald-800' : 'hover:bg-stone-800'} ${
                        game.openingPly !== undefined && p < game.openingPly ? 'text-sky-300' : ''
                      }`}
                    >
                      {figurine(game.moves[p]!)}
                      {advice && (
                        <span className={`ml-0.5 font-semibold ${JUDGMENT_TEXT[advice.judgment]}`}>
                          {JUDGMENT_SYMBOLS[advice.judgment]}
                        </span>
                      )}
                    </button>
                  )
                })}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}
