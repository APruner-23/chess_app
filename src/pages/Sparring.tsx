import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import { Board } from '../components/Board'
import { EnginePanel } from '../components/EnginePanel'
import { EvalBar } from '../components/EvalBar'
import { PageHeader } from '../components/PageHeader'
import { BOARD_COLUMN } from '../components/format'
import { figurine } from '../chess/figurine'
import { outcomeOf, replaySan } from '../chess/position'
import { db } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { engineQueue } from '../engine/instance'
import type { Color, Eval } from '../import/types'
import { positionFromEpd } from '../repertoire/graph'
import { loadMoves } from '../repertoire/repo'
import { allLines } from '../training/session'
import { RepGraph } from '../repertoire/graph'
import {
  BOT_LEVELS,
  BOT_MULTI_PV,
  endText,
  gameEnd,
  pickBotMove,
  type GameEnd,
} from '../sparring/bot'

const LEVEL_KEY = 'sparringLevel'
/** The bot never answers faster than this, so its moves can be followed. */
const MIN_THINK_MS = 500

interface Setup {
  moves: string[]
  color: Color
  level: number
  /** Where the game started from, shown in the header. */
  from: string
}

/**
 * A game against Stockfish at an adjustable level, from the start, from the end of a
 * repertoire line, or from a position passed as `?moves=e4,e5&color=white` (editor,
 * game review). When the game ends, the same page reviews it with the engine.
 */
export function Sparring() {
  const [game, setGame] = useState<Setup>()
  return (
    <>
      <PageHeader title="Sparring contro il motore">
        {game
          ? `Livello ${game.level + 1} · ${BOT_LEVELS[game.level]!.label} · ${game.from}`
          : undefined}
      </PageHeader>
      {game ? (
        <Game key={JSON.stringify(game)} setup={game} onNew={() => setGame(undefined)} />
      ) : (
        <SetupForm onStart={setGame} />
      )}
    </>
  )
}

function SetupForm({ onStart }: { onStart: (s: Setup) => void }) {
  const [params] = useSearchParams()
  const given = validMoves(params.get('moves')?.split(',').filter(Boolean) ?? [])
  const givenColor =
    params.get('color') === 'black'
      ? 'black'
      : params.get('color') === 'white'
        ? 'white'
        : undefined
  const reps = useLiveQuery(() => db.repertoires.toArray())
  const savedLevel = useLiveQuery(() => getSetting(db, LEVEL_KEY, 2))
  const [start, setStart] = useState(given.length ? 'given' : 'initial')
  const [color, setColor] = useState<Color | 'random'>(givenColor ?? 'white')
  const [level, setLevel] = useState<number>()
  const lvl = level ?? savedLevel ?? 2
  const rep = reps?.find((r) => r.id === start)

  async function go() {
    void setSetting(db, LEVEL_KEY, lvl)
    let moves: string[] = []
    let from = 'posizione iniziale'
    let c: Color = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color
    if (start === 'given') {
      moves = given
      from = `posizione scelta (${Math.ceil(given.length / 2)} mosse)`
    } else if (rep) {
      const lines = allLines(new RepGraph(await loadMoves(db, rep.id)), rep.color, rep.id)
      const line = lines[Math.floor(Math.random() * lines.length)]
      moves = line?.map((s) => s.move.san) ?? []
      c = rep.color
      from = `fine di una linea di ${rep.name}`
    }
    onStart({ moves, color: c, level: lvl, from })
  }

  const field = 'rounded-md bg-stone-800 px-3 py-2'
  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-stone-800 bg-stone-950/40 p-4">
      <label className="block space-y-1">
        <span className="text-sm text-stone-400">Partenza</span>
        <select
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={`${field} w-full`}
        >
          {given.length > 0 && (
            <option value="given">Posizione scelta ({Math.ceil(given.length / 2)} mosse)</option>
          )}
          <option value="initial">Posizione iniziale</option>
          {reps?.map((r) => (
            <option key={r.id} value={r.id}>
              Fine di una linea a caso: {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-stone-400">Giochi col</span>
        <select
          value={rep ? rep.color : color}
          disabled={!!rep}
          onChange={(e) => setColor(e.target.value as Color | 'random')}
          className={`${field} w-full disabled:opacity-60`}
        >
          <option value="white">Bianco</option>
          <option value="black">Nero</option>
          <option value="random">A caso</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-stone-400">
          Livello {lvl + 1}: {BOT_LEVELS[lvl]!.label}
        </span>
        <input
          type="range"
          min={0}
          max={BOT_LEVELS.length - 1}
          value={lvl}
          onChange={(e) => setLevel(Number(e.target.value))}
          className="w-full accent-emerald-500"
          aria-label="Livello del motore"
        />
        <span className="text-xs text-stone-500">
          Ai livelli bassi il motore sceglie a volte mosse peggiori, come un giocatore umano;
          all'ultimo gioca sempre la migliore.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void go()}
        className="w-full rounded-md bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600"
      >
        Gioca
      </button>
    </div>
  )
}

/** The longest legal prefix of moves passed in the URL. */
function validMoves(sans: string[]): string[] {
  for (let n = sans.length; n > 0; n--) {
    try {
      replaySan(sans.slice(0, n))
      return sans.slice(0, n)
    } catch {
      // illegal move: try a shorter prefix
    }
  }
  return []
}

function sanOf(fen: string, uci: string): string | undefined {
  const pos = positionFromEpd(fen.split(' ').slice(0, 4).join(' '))
  const move = parseUci(uci)
  return move && pos.isLegal(move) ? makeSan(pos, move) : undefined
}

function Game({ setup, onNew }: { setup: Setup; onNew: () => void }) {
  const [moves, setMoves] = useState(setup.moves)
  const [resigned, setResigned] = useState(false)
  /** Position shown during the review, after the game. */
  const [view, setView] = useState<number>()
  const [ev, setEv] = useState<Eval>()
  const replay = useMemo(() => replaySan(moves), [moves])
  const fens = replay.fens
  const fen = fens[fens.length - 1]!
  const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const end: GameEnd | undefined = resigned
    ? { winner: setup.color === 'white' ? 'black' : 'white', reason: 'resign' }
    : gameEnd(fens)
  const botTurn = !end && turn !== setup.color

  // The bot's move: candidate lines from the engine, then a pick weighted by the level.
  useEffect(() => {
    if (!botTurn) return
    const level = BOT_LEVELS[setup.level]!
    const started = performance.now()
    const handle = engineQueue('live').submit(
      { fen, multiPv: BOT_MULTI_PV, nodes: level.nodes },
      'live',
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    handle.result.then(
      ({ lines, bestMove }) => {
        if (!live) return
        const uci = pickBotMove(lines, turn, level) ?? bestMove
        const san = uci && sanOf(fen, uci)
        if (!san) return
        const wait = Math.max(0, MIN_THINK_MS - (performance.now() - started))
        timer = setTimeout(() => live && setMoves((m) => [...m, san]), wait)
      },
      () => {},
    )
    return () => {
      live = false
      clearTimeout(timer)
      handle.cancel()
    }
  }, [botTurn, fen, turn, setup.level])

  const onMove = useCallback(
    (uci: string) => {
      const san = sanOf(fen, uci)
      if (san) setMoves((m) => [...m, san])
    },
    [fen],
  )

  /** Takes back the user's last move (and the bot's answer to it). */
  const takeBack = () => {
    let n = moves.length
    do n--
    while (n > setup.moves.length && (n % 2 === 0 ? 'white' : 'black') !== setup.color)
    if (n >= setup.moves.length) setMoves(moves.slice(0, n))
  }
  const canTakeBack = !end && moves.length > setup.moves.length && !botTurn

  const shown = end && view !== undefined ? view : fens.length - 1
  const shownFen = fens[shown]!
  const lastMove = shown > 0 ? replay.ucis[shown - 1] : undefined
  const btn = 'rounded-md bg-stone-800 px-3 py-1.5 text-sm hover:bg-stone-700 disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={`${BOARD_COLUMN} space-y-3`}>
        <div className="flex gap-2">
          {end && <EvalBar value={ev} orientation={setup.color} outcome={outcomeOf(shownFen)} />}
          <div className="min-w-0 flex-1">
            <Board
              fen={shownFen}
              orientation={setup.color}
              lastMove={lastMove}
              onMove={!end && !botTurn ? onMove : undefined}
            />
          </div>
        </div>
        {end && (
          <div className="flex justify-center gap-2">
            <button type="button" className={btn} onClick={() => setView(0)} disabled={shown === 0}>
              ⏮
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setView(shown - 1)}
              disabled={shown === 0}
            >
              ◀
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setView(shown + 1)}
              disabled={shown === fens.length - 1}
            >
              ▶
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setView(fens.length - 1)}
              disabled={shown === fens.length - 1}
            >
              ⏭
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-lg bg-stone-950/40 p-4">
          {end ? (
            <p className="text-lg font-semibold">{endText(end, setup.color)}</p>
          ) : botTurn ? (
            <p className="text-lg text-stone-400">Il motore pensa…</p>
          ) : (
            <p className="text-lg">Tocca a te ({setup.color === 'white' ? 'Bianco' : 'Nero'}).</p>
          )}
          {end && (
            <p className="mt-1 text-sm text-stone-400">
              Rivedi la partita con il motore: scorri le mosse o cliccale qui sotto.
            </p>
          )}
        </div>

        {end && (
          <EnginePanel fen={shownFen} onBest={(_, e, __, at) => at === shownFen && e && setEv(e)} />
        )}

        <div className="flex flex-wrap gap-2">
          {!end && (
            <>
              <button type="button" className={btn} onClick={takeBack} disabled={!canTakeBack}>
                Annulla mossa
              </button>
              <button type="button" className={btn} onClick={() => setResigned(true)}>
                Abbandona
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600"
            onClick={onNew}
          >
            Nuova partita
          </button>
        </div>

        <p className="rounded-lg bg-stone-950/40 p-3 text-sm leading-7">
          {moves.map((san, i) => (
            <button
              key={i}
              type="button"
              disabled={!end}
              onClick={() => setView(i + 1)}
              className={`mr-1 rounded px-1 ${i < setup.moves.length ? 'text-stone-500' : ''} ${
                end && shown === i + 1 ? 'bg-emerald-800' : end ? 'hover:bg-stone-800' : ''
              }`}
            >
              {i % 2 === 0 ? `${i / 2 + 1}.` : ''}
              {figurine(san)}
            </button>
          ))}
          {moves.length === 0 && <span className="text-stone-500">Nessuna mossa</span>}
        </p>
      </div>
    </div>
  )
}
