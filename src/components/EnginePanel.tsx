import { useEffect, useState } from 'react'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSanVariation } from 'chessops/san'
import { parseUci } from 'chessops'
import { engineQueue } from '../engine/instance'
import type { PvLine } from '../engine/uci'
import { figurine } from '../chess/figurine'
import { formatEval } from './evalFormat'

const LIVE_DEPTH = 22
const MULTI_PV = 3

/** "e2e4 e7e5" → "1. e4 e5" (figurine), starting from the given position. */
function pvToSan(fen: string, pv: string[]): string {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const moves = pv.slice(0, 10).map((u) => parseUci(u)!)
  return figurine(makeSanVariation(pos, moves))
}

/** Live MultiPV analysis of the position on screen; reports the best move for the arrow. */
export function EnginePanel({ fen, onBest }: { fen: string; onBest: (uci?: string) => void }) {
  const [enabled, setEnabled] = useState(true)
  const [result, setResult] = useState<{ fen: string; lines: PvLine[] }>({ fen, lines: [] })

  useEffect(() => {
    if (!enabled) return
    let last = 0
    const handle = engineQueue().submit(
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
  }, [fen, enabled])

  const lines = enabled && result.fen === fen ? result.lines : []
  const best = lines[0]?.pv[0]
  useEffect(() => onBest(best), [best, onBest])

  return (
    <section className="rounded-lg bg-stone-950/40 p-2 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-stone-400">
          Stockfish 19 lite{lines[0] ? ` · profondità ${lines[0].depth}` : ''}
        </span>
        <label className="flex items-center gap-2 text-stone-400">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Analisi live
        </label>
      </div>
      {enabled &&
        (lines.length === 0 ? (
          <p className="text-stone-500">Calcolo…</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((l) => (
              <li key={l.multipv} className="flex gap-2">
                <span className="w-14 shrink-0 font-mono font-semibold">{formatEval(l.eval)}</span>
                <span className="truncate text-stone-300">{pvToSan(fen, l.pv)}</span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}
