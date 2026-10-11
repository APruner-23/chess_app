import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseUci } from 'chessops'
import { makeSan } from 'chessops/san'
import { Board } from '../components/Board'
import { ExplorerPanel } from '../components/ExplorerPanel'
import { CoveragePanel } from '../components/CoveragePanel'
import { figurine } from '../chess/figurine'
import { replaySan } from '../chess/position'
import { db } from '../db/schema'
import { RepGraph, positionFromEpd } from '../repertoire/graph'
import { exportPgn, importPgn, studyPgnUrl } from '../repertoire/pgnIO'
import {
  addLine,
  deleteMove,
  deleteRepertoire,
  loadMoves,
  mergeMoves,
  setMainMove,
  setNote,
} from '../repertoire/repo'
import type { Repertoire } from '../repertoire/types'

export function Editor() {
  const { id = '' } = useParams()
  const rep = useLiveQuery(async () => (await db.repertoires.get(id)) ?? null, [id])
  if (rep === undefined) return null
  if (rep === null) return <p>Repertorio non trovato.</p>
  return <RepertoireEditor key={rep.id} rep={rep} />
}

const btn = 'rounded-md bg-stone-800 px-3 py-1.5 text-sm hover:bg-stone-700 disabled:opacity-40'

function RepertoireEditor({ rep }: { rep: Repertoire }) {
  const navigate = useNavigate()
  const moves = useLiveQuery(() => loadMoves(db, rep.id), [rep.id])
  const graph = useMemo(() => new RepGraph(moves ?? []), [moves])
  /** Current line from the start, in SAN: it may go beyond the repertoire. */
  const [path, setPath] = useState<string[]>([])
  const [best, setBest] = useState<string>()
  const [showImport, setShowImport] = useState(false)
  const replay = useMemo(() => replaySan(path), [path])
  const epd = replay.epds[path.length]!
  const children = graph.children(epd)

  // Which plies of the current line are already in the repertoire.
  const inRep = path.map((san, i) => graph.children(replay.epds[i]!).some((m) => m.san === san))
  const missing = inRep.indexOf(false)
  const reaching = path.length
    ? graph.children(replay.epds[path.length - 1]!).find((m) => m.san === path[path.length - 1])
    : undefined

  const play = useCallback((san: string) => setPath((p) => [...p, san]), [])
  const onMove = useCallback(
    (uci: string) => {
      const pos = positionFromEpd(epd)
      const move = parseUci(uci)
      if (move && pos.isLegal(move)) play(makeSan(pos, move))
    },
    [epd, play],
  )
  const onBest = useCallback((uci?: string) => setBest(uci), [])
  const addFromHere = (sans: string[]) =>
    // Adds the line up to here first, then each new move as a branch of the current position.
    addLine(db, rep.id, replay.epds[0]!, path).then(() =>
      Promise.all(sans.map((san) => addLine(db, rep.id, epd, [san]))),
    )

  function download() {
    const blob = new Blob([exportPgn(rep, moves ?? [])], { type: 'application/x-chess-pgn' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${rep.name.replace(/[^\w-]+/g, '_')}.pgn`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-sm text-stone-400 hover:underline"
          onClick={() => navigate('/repertori')}
        >
          ← Repertori
        </button>
        <input
          defaultValue={rep.name}
          onBlur={(e) =>
            db.repertoires.update(rep.id, {
              name: e.target.value.trim() || rep.name,
              updatedAt: Date.now(),
            })
          }
          className="min-w-0 flex-1 rounded bg-transparent px-1 text-xl font-semibold hover:bg-stone-800 focus:bg-stone-800"
          aria-label="Nome del repertorio"
        />
        <span className="text-sm text-stone-400">{rep.color === 'white' ? 'Bianco' : 'Nero'}</span>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={rep.experimental}
            onChange={(e) =>
              db.repertoires.update(rep.id, {
                experimental: e.target.checked,
                updatedAt: Date.now(),
              })
            }
          />
          Sperimentale
        </label>
        <button type="button" className={btn} onClick={() => setShowImport(!showImport)}>
          Importa
        </button>
        <button type="button" className={btn} onClick={download} disabled={!moves?.length}>
          Esporta PGN
        </button>
        <button
          type="button"
          className={`${btn} text-red-300`}
          onClick={async () => {
            if (confirm(`Eliminare “${rep.name}” e tutte le sue mosse?`)) {
              await deleteRepertoire(db, rep.id)
              navigate('/repertori')
            }
          }}
        >
          Elimina
        </button>
      </div>

      {showImport && <ImportBox repertoireId={rep.id} onDone={() => setShowImport(false)} />}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full max-w-[min(100%,520px)] space-y-3">
          <Board
            fen={replay.fens[path.length]!}
            orientation={rep.color}
            lastMove={path.length ? replay.ucis[path.length - 1] : undefined}
            arrows={best ? [best] : children[0] ? [children[0].uci] : undefined}
            onMove={onMove}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => setPath([])}
              disabled={!path.length}
            >
              ⏮
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setPath(path.slice(0, -1))}
              disabled={!path.length}
            >
              ◀
            </button>
            {missing >= 0 && (
              <button
                type="button"
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600"
                onClick={() => addLine(db, rep.id, replay.epds[0]!, path)}
              >
                Aggiungi la linea al repertorio
              </button>
            )}
          </div>

          <p className="min-h-6 text-sm leading-7">
            {path.length === 0 && <span className="text-stone-500">Posizione iniziale</span>}
            {path.map((san, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                className={`mr-1 rounded px-1 ${inRep[i] ? '' : 'text-stone-500 italic'} ${i === path.length - 1 ? 'bg-emerald-800' : 'hover:bg-stone-800'}`}
              >
                {i % 2 === 0 ? `${i / 2 + 1}.` : ''}
                {figurine(san)}
              </button>
            ))}
          </p>

          <section className="rounded-lg bg-stone-950/40 p-3 text-sm">
            <h2 className="mb-1 font-medium">Mosse preparate qui</h2>
            {children.length === 0 ? (
              <p className="text-stone-500">
                Nessuna: gioca una mossa sulla scacchiera o scegline una dall'explorer.
              </p>
            ) : (
              <ul className="space-y-1">
                {children.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => play(m.san)}
                      className="min-w-14 text-left font-medium hover:underline"
                    >
                      {figurine(m.san)}
                    </button>
                    {i === 0 ? (
                      <span className="text-xs text-emerald-400">principale</span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-stone-400 hover:underline"
                        onClick={() => setMainMove(db, m)}
                      >
                        rendi principale
                      </button>
                    )}
                    {m.note && <span className="truncate text-stone-400">— {m.note}</span>}
                    <button
                      type="button"
                      className="ml-auto text-xs text-red-300 hover:underline"
                      onClick={() => deleteMove(db, m)}
                    >
                      elimina
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {reaching && (
              <label className="mt-3 block">
                <span className="text-stone-400">
                  Nota sull'ultima mossa ({figurine(reaching.san)}): qual è l'idea?
                </span>
                <textarea
                  key={reaching.id}
                  defaultValue={reaching.note}
                  onBlur={(e) => setNote(db, reaching, e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1"
                />
              </label>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ExplorerPanel
            epd={epd}
            color={rep.color}
            prepared={new Set(children.map((m) => m.san))}
            onPlay={play}
            onAdd={addFromHere}
            onBest={onBest}
          />
          <CoveragePanel graph={graph} color={rep.color} onGo={setPath} />
        </div>
      </div>
    </>
  )
}

function ImportBox({ repertoireId, onDone }: { repertoireId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string>()

  async function run() {
    try {
      let pgn = text
      const url = studyPgnUrl(text)
      if (url) {
        setStatus('Scarico lo studio…')
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Lichess ha risposto ${res.status}`)
        pgn = await res.text()
      }
      const moves = importPgn(repertoireId, pgn)
      if (moves.length === 0) throw new Error('Nessuna mossa valida trovata.')
      const added = await mergeMoves(db, repertoireId, moves)
      setStatus(`${added} mosse nuove aggiunte.`)
      setText('')
      setTimeout(onDone, 1500)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  return (
    <section className="mb-4 space-y-2 rounded-lg border border-stone-800 bg-stone-950/40 p-3 text-sm">
      <p className="text-stone-400">
        Incolla un PGN (con varianti e commenti) oppure l'indirizzo di uno studio Lichess.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="block w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 font-mono"
        placeholder="1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *   oppure   https://lichess.org/study/…"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={run} disabled={!text.trim()} className={btn}>
          Importa
        </button>
        {status && <span className="text-stone-300">{status}</span>}
      </div>
    </section>
  )
}
