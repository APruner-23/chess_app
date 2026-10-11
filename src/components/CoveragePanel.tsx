import { useState } from 'react'
import type { Color } from '../import/types'
import { totalGames } from '../lichess/explorer'
import { coverage, type Coverage, type MoveFreq } from '../repertoire/coverage'
import { RepGraph, turnOf } from '../repertoire/graph'
import { figurine } from '../chess/figurine'
import { explorer, useExplorerParams } from './lichessClient'

const DEPTH = 10

function pathLabel(path: string[]): string {
  return path.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${figurine(san)}`).join(' ')
}

/** How often games stay in preparation, and the most likely holes. */
export function CoveragePanel({
  graph,
  color,
  onGo,
}: {
  graph: RepGraph
  color: Color
  onGo: (path: string[]) => void
}) {
  const params = useExplorerParams()
  const [result, setResult] = useState<Coverage>()
  const [status, setStatus] = useState<string>()

  async function run() {
    const opponentPositions = [...graph.reachable().epds].filter((e) => turnOf(e) !== color)
    const freqs = new Map<string, MoveFreq[]>()
    try {
      for (const [i, epd] of opponentPositions.entries()) {
        setStatus(`Explorer: posizione ${i + 1} di ${opponentPositions.length}…`)
        const r = await explorer.get('lichess', epd, params)
        freqs.set(
          epd,
          r.moves.map((m) => ({ san: m.san, games: totalGames(m) })),
        )
      }
      setStatus(undefined)
      setResult(coverage(graph, color, (epd) => freqs.get(epd), DEPTH))
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  return (
    <section className="rounded-lg bg-stone-950/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Copertura</h2>
        <button
          type="button"
          onClick={run}
          className="rounded bg-stone-800 px-3 py-1 hover:bg-stone-700"
        >
          {result ? 'Ricalcola' : 'Calcola'}
        </button>
      </div>
      {status && <p className="mt-2 text-stone-400">{status}</p>}
      {result && (
        <>
          <p className="mt-2 text-stone-400">
            Probabilità di essere ancora in preparazione dopo la mossa N (con l'explorer al tuo
            livello):
          </p>
          <div className="mt-1 grid grid-cols-10 gap-1 text-center text-xs">
            {result.byMove.map((p, i) => (
              <div key={i} title={`Mossa ${i + 1}: ${Math.round(p * 100)}%`}>
                <div className="relative h-12 overflow-hidden rounded bg-stone-800">
                  <div
                    className="absolute inset-x-0 bottom-0 bg-emerald-600"
                    style={{ height: `${p * 100}%` }}
                  />
                </div>
                <div className="text-stone-400">{i + 1}</div>
                <div>{Math.round(p * 100)}%</div>
              </div>
            ))}
          </div>
          <h3 className="mt-3 font-medium">Buchi più probabili</h3>
          {result.holes.length === 0 ? (
            <p className="text-stone-400">Nessun buco sopra l'1% delle partite.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {result.holes.slice(0, 8).map((h) => (
                <li key={`${h.epd}|${h.san}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="text-stone-400">{pathLabel(h.path)}</span>{' '}
                    <span className="font-medium">
                      {h.san ? figurine(h.san) : '— manca la tua risposta'}
                    </span>{' '}
                    <span className="text-stone-500">
                      in {(h.score * 100).toFixed(1)}% delle partite
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onGo(h.san ? [...h.path, h.san] : h.path)}
                    className="shrink-0 rounded bg-emerald-800 px-2 py-0.5 hover:bg-emerald-700"
                  >
                    Prepara
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
