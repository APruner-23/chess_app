import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { figurine } from '../chess/figurine'
import { INITIAL_EPD } from '../chess/position'
import { db } from '../db/schema'
import type { Color, Speed } from '../import/types'
import { draftFromGames, draftLines, draftSize, type DraftNode } from '../repertoire/fromGames'
import { addLine, createRepertoire } from '../repertoire/repo'
import { SPEED_LABELS } from './format'

const field = 'rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-sm'

function Tree({ nodes, ply }: { nodes: DraftNode[]; ply: number }) {
  return (
    <ul className={ply ? 'ml-4 border-l border-stone-800 pl-2' : ''}>
      {nodes.map((n) => (
        <li key={n.san}>
          <span className={`whitespace-nowrap ${n.mine ? 'font-medium' : 'text-stone-400'}`}>
            {ply % 2 === 0 ? `${ply / 2 + 1}.` : `${Math.ceil(ply / 2)}…`}
            {figurine(n.san)}
          </span>{' '}
          <span className="text-xs text-stone-500">
            {n.games} partite · {Math.round(n.score * 100)}%
          </span>
          {n.weak && (
            <span
              className="ml-1 text-xs text-red-300"
              title="Punteggio basso: valuta un'alternativa"
            >
              ⚠ da rivedere
            </span>
          )}
          {n.children.length > 0 && <Tree nodes={n.children} ply={ply + 1} />}
        </li>
      ))}
    </ul>
  )
}

/**
 * Proposes a repertoire from the user's own games: the moves they play most, the replies
 * they meet most. Shown as a tree; one click creates the repertoire.
 */
export function DraftFromGames() {
  const navigate = useNavigate()
  const games = useLiveQuery(() => db.games.toArray())
  const [color, setColor] = useState<Color>('white')
  const [speed, setSpeed] = useState<Speed | ''>('')
  const [moves, setMoves] = useState(8)
  const [minGames, setMinGames] = useState(5)
  const [busy, setBusy] = useState(false)

  const draft = useMemo(
    () =>
      games
        ? draftFromGames(
            games.filter((g) => !speed || g.speed === speed),
            color,
            { maxPlies: moves * 2, minGames },
          )
        : [],
    [games, color, speed, moves, minGames],
  )
  const size = draftSize(draft)

  async function create() {
    setBusy(true)
    const rep = await createRepertoire(db, {
      name: `Dalle mie partite (${color === 'white' ? 'Bianco' : 'Nero'}${speed ? `, ${SPEED_LABELS[speed]}` : ''})`,
      color,
      experimental: false,
    })
    for (const line of draftLines(draft)) await addLine(db, rep.id, INITIAL_EPD, line)
    navigate(`/repertori/${rep.id}`)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-400">
        Parte dalle mosse che giochi più spesso e dalle risposte che incontri più spesso. Le tue
        mosse con un punteggio basso sono segnate: dopo averlo creato, nell'editor puoi sostituirle
        guardando l'explorer.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Colore"
          value={color}
          onChange={(e) => setColor(e.target.value as Color)}
          className={field}
        >
          <option value="white">Col Bianco</option>
          <option value="black">Col Nero</option>
        </select>
        <select
          aria-label="Cadenza"
          value={speed}
          onChange={(e) => setSpeed(e.target.value as Speed | '')}
          className={field}
        >
          <option value="">Tutte le cadenze</option>
          {(Object.keys(SPEED_LABELS) as Speed[]).map((s) => (
            <option key={s} value={s}>
              {SPEED_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Profondità"
          value={moves}
          onChange={(e) => setMoves(Number(e.target.value))}
          className={field}
        >
          {[6, 8, 10, 12].map((m) => (
            <option key={m} value={m}>
              {m} mosse
            </option>
          ))}
        </select>
        <select
          aria-label="Partite minime"
          value={minGames}
          onChange={(e) => setMinGames(Number(e.target.value))}
          className={field}
        >
          {[3, 5, 10, 20].map((m) => (
            <option key={m} value={m}>
              almeno {m} partite
            </option>
          ))}
        </select>
      </div>
      {!games ? null : size === 0 ? (
        <p className="text-sm text-stone-400">
          Nessuna mossa giocata abbastanza spesso con questi filtri: abbassa le partite minime o
          importa altre partite.
        </p>
      ) : (
        <>
          <div className="max-h-96 overflow-auto rounded-md bg-stone-900/60 p-3 text-sm leading-6">
            <Tree nodes={draft} ply={0} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
          >
            Crea il repertorio ({size} mosse)
          </button>
        </>
      )}
    </div>
  )
}
