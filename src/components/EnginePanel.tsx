import { useEffect, useState } from 'react'
import { engineQueue } from '../engine/instance'
import type { PvLine } from '../engine/uci'
import type { Eval } from '../import/types'
import { figurine } from '../chess/figurine'
import { pvMoves } from '../chess/pv'
import { outcomeOf, type Outcome } from '../chess/position'
import { formatEval } from './evalFormat'

const LIVE_DEPTH = 22
const MULTI_PV = 3

/** A clickable line of moves: a click plays the line up to that move. */
export function PvLineView({
  fen,
  pv,
  onPlay,
}: {
  fen: string
  pv: readonly string[]
  onPlay?: (sans: string[]) => void
}) {
  const moves = pvMoves(fen, pv)
  return (
    <span className="min-w-0 truncate text-stone-300">
      {moves.map((m, i) => (
        <span key={i}>
          {m.label && <span className="text-stone-500">{m.label}</span>}
          {onPlay ? (
            <button
              type="button"
              onClick={() => onPlay(moves.slice(0, i + 1).map((x) => x.san))}
              className="rounded px-0.5 hover:bg-stone-700"
            >
              {figurine(m.san)}
            </button>
          ) : (
            <span className="px-0.5">{figurine(m.san)}</span>
          )}{' '}
        </span>
      ))}
    </span>
  )
}

function outcomeText(o: Outcome): string {
  if (o.reason === 'checkmate')
    return `${o.winner === 'white' ? 'Il Bianco' : 'Il Nero'} vince per scacco matto`
  return o.reason === 'stalemate' ? 'Patta per stallo' : 'Patta: materiale insufficiente'
}

/** Live MultiPV analysis of the position on screen; reports the best move and its eval. */
export function EnginePanel({
  fen,
  onBest,
  onPlay,
}: {
  fen: string
  /** Best move and eval of `fen` so far, reported as the search deepens. */
  onBest?: (uci?: string, ev?: Eval, depth?: number, fen?: string) => void
  /** Click on a move of a line: plays the line up to that move. */
  onPlay?: (sans: string[]) => void
}) {
  const [result, setResult] = useState<{ fen: string; lines: PvLine[] }>({ fen, lines: [] })
  const over = outcomeOf(fen)

  useEffect(() => {
    if (outcomeOf(fen)) return // nothing to search in a finished position
    let last = 0
    const handle = engineQueue('live').submit(
      {
        fen,
        multiPv: MULTI_PV,
        depth: LIVE_DEPTH,
        onInfo: (lines) => {
          // At most ~5 renders per second while the search deepens.
          const now = performance.now()
          if (now - last < 200) return
          last = now
          setResult({ fen, lines: [...lines] })
        },
      },
      'live',
    )
    handle.result.then(({ lines }) => {
      if (lines.length) setResult({ fen, lines })
    })
    return handle.cancel
  }, [fen])

  const lines = result.fen === fen ? result.lines : []
  const best = lines[0]?.pv[0]
  const bestEval = lines[0]?.eval
  const depth = lines[0]?.depth
  const evalKey = bestEval ? formatEval(bestEval) : ''
  useEffect(() => onBest?.(best, bestEval, depth, fen), [best, evalKey, depth]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="rounded-lg bg-stone-950/40 p-2 text-sm">
      <div className="mb-1 text-stone-400">
        Stockfish 19 lite{lines[0] ? ` · profondità ${lines[0].depth}` : ''}
      </div>
      {over ? (
        <p className="font-semibold">{outcomeText(over)}</p>
      ) : lines.length === 0 ? (
        <p className="text-stone-500">Calcolo…</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.multipv} className="flex gap-2">
              <span className="w-14 shrink-0 font-mono font-semibold">{formatEval(l.eval)}</span>
              <PvLineView fen={fen} pv={l.pv} onPlay={onPlay} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
