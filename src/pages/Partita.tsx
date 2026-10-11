import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Board } from '../components/Board'
import { SITE_LABELS } from '../components/accounts'
import { RESULT_COLORS, RESULT_LABELS, SPEED_LABELS, formatDate } from '../components/format'
import { figurine } from '../chess/figurine'
import { replaySan } from '../chess/position'
import { db } from '../db/schema'
import type { Game } from '../import/types'

/** Simple game viewer: board, move list, step through with buttons or arrow keys. */
export function Partita() {
  const { id = '' } = useParams()
  // null = still loading, undefined = not in the database
  const game = useLiveQuery(async () => (await db.games.get(id)) ?? null, [id])
  if (game === undefined) return null
  if (game === null) return <p>Partita non trovata.</p>
  // Keyed so the position resets to the final move when another game opens.
  return <GameViewer key={game.id} game={game} />
}

function GameViewer({ game }: { game: Game }) {
  const replay = useMemo(() => replaySan(game.moves), [game])
  const last = game.moves.length
  const [ply, setPly] = useState(last)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(last, p + 1))
      else if (e.key === 'Home') setPly(0)
      else if (e.key === 'End') setPly(last)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  const btn = 'rounded-md bg-stone-800 px-4 py-2 hover:bg-stone-700 disabled:opacity-40'
  return (
    <>
      <Link to=".." relative="path" className="text-sm text-stone-400 hover:underline">
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
        <div className="w-full max-w-[min(100%,560px)]">
          <Board
            fen={replay.fens[ply]!}
            orientation={game.userColor}
            lastMove={ply > 0 ? replay.ucis[ply - 1] : undefined}
          />
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => setPly(0)}
              disabled={ply === 0}
              aria-label="Inizio"
            >
              ⏮
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setPly(ply - 1)}
              disabled={ply === 0}
              aria-label="Indietro"
            >
              ◀
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setPly(ply + 1)}
              disabled={ply === last}
              aria-label="Avanti"
            >
              ▶
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setPly(last)}
              disabled={ply === last}
              aria-label="Fine"
            >
              ⏭
            </button>
          </div>
        </div>

        <ol className="grid max-h-[560px] flex-1 grid-cols-[3rem_1fr_1fr] content-start overflow-y-auto rounded-lg bg-stone-950/40 p-2 text-sm">
          {Array.from({ length: Math.ceil(last / 2) }, (_, i) => (
            <li key={i} className="contents">
              <span className="py-1 pr-2 text-right text-stone-500">{i + 1}.</span>
              {[2 * i, 2 * i + 1].map((p) =>
                p < last ? (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPly(p + 1)}
                    className={`rounded px-2 py-1 text-left ${ply === p + 1 ? 'bg-emerald-800' : 'hover:bg-stone-800'} ${
                      game.openingPly !== undefined && p < game.openingPly ? 'text-sky-300' : ''
                    }`}
                  >
                    {figurine(game.moves[p]!)}
                  </button>
                ) : (
                  <span key={p} />
                ),
              )}
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
