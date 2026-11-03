import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import { figurine } from '../chess/figurine'
import { replaySanFrom } from '../chess/position'
import { GOAL_LABELS, type Endgame } from '../endgames/catalog'
import { judgeEndgame, HOLD_MOVES, type Verdict } from '../endgames/judge'
import type { Eval } from '../import/types'
import { gameEnd, type BotLevel } from '../sparring/bot'
import { Board } from './Board'
import { BOARD_COLUMN } from './format'
import { useBotMove } from './useBotMove'

/** The defender plays at full strength, within a budget that keeps replies quick. */
const ENDGAME_BOT: BotLevel = { label: 'Finali', nodes: 250_000, temperature: 0 }

function sanOf(fen: string, uci: string): string | undefined {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const move = parseUci(uci)
  return move && pos.isLegal(move) ? makeSan(pos, move) : undefined
}

/**
 * Plays an endgame exercise against the engine at full strength until it is won,
 * held or lost (`judgeEndgame`). `onFirstResult` gets only the first attempt.
 */
export function EndgameTrainer({
  endgame,
  onFirstResult,
  onNext,
  nextLabel,
}: {
  endgame: Endgame
  onFirstResult?: (ok: boolean) => void
  onNext: () => void
  nextLabel: string
}) {
  const [moves, setMoves] = useState<string[]>([])
  const [evaluation, setEvaluation] = useState<Eval>()
  const [showIdea, setShowIdea] = useState(false)
  const recorded = useRef(false)

  const replay = useMemo(() => replaySanFrom(endgame.fen, moves), [endgame, moves])
  const fens = replay.fens
  const fen = fens[fens.length - 1]!
  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const userFirst = endgame.fen.split(' ')[1] === (endgame.color === 'white' ? 'w' : 'b')
  const userMoves = Math.ceil((moves.length - (userFirst ? 0 : 1)) / 2)
  const promoted = moves.some((san, i) => san.includes('=') && (i % 2 === 0) === userFirst)
  const verdict: Verdict | undefined = judgeEndgame({
    goal: endgame.goal,
    color: endgame.color,
    end: gameEnd(fens),
    evaluation,
    promoted,
    userMoves,
  })
  const outcome = verdict?.ok
  useEffect(() => {
    if (outcome === undefined || recorded.current) return
    recorded.current = true
    onFirstResult?.(outcome)
  }, [outcome, onFirstResult])
  const botTurn = !verdict && turn !== endgame.color

  useBotMove({
    fen,
    active: botTurn,
    level: ENDGAME_BOT,
    onMove: (san, info) => {
      if (info.eval) setEvaluation(info.eval)
      setMoves((m) => [...m, san])
    },
  })

  const onMove = useCallback(
    (uci: string) => {
      const san = sanOf(fen, uci)
      if (san) setMoves((m) => [...m, san])
    },
    [fen],
  )

  const retry = () => {
    setMoves([])
    setEvaluation(undefined)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={BOARD_COLUMN}>
        <Board
          fen={fen}
          orientation={endgame.color}
          lastMove={replay.ucis.at(-1)}
          onMove={!verdict && !botTurn ? onMove : undefined}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-lg bg-stone-950/40 p-4">
          <div className="text-sm text-stone-400">{endgame.category}</div>
          <h2 className="text-xl font-semibold">{endgame.title}</h2>
          <p className="mt-1">
            Giochi col {endgame.color === 'white' ? 'Bianco' : 'Nero'}: {GOAL_LABELS[endgame.goal]}
            {endgame.goal === 'draw' ? ` (almeno ${HOLD_MOVES} mosse)` : ''}.
          </p>
        </div>

        <div className="rounded-lg bg-stone-950/40 p-4">
          {verdict ? (
            <p
              className={`text-lg font-semibold ${verdict.ok ? 'text-emerald-400' : 'text-red-300'}`}
            >
              {verdict.ok ? '✓ ' : '✗ '}
              {verdict.why}
            </p>
          ) : botTurn ? (
            <p className="text-lg text-stone-400">Il motore pensa…</p>
          ) : (
            <p className="text-lg">Tocca a te.</p>
          )}
          {endgame.goal === 'draw' && !verdict && (
            <p className="mt-1 text-sm text-stone-400">
              Mosse tenute: {userMoves} di {HOLD_MOVES}
            </p>
          )}
          {(showIdea || verdict) && (
            <p className="mt-3 text-sm text-stone-300">💡 {endgame.idea}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {verdict ? (
              <>
                <button
                  type="button"
                  onClick={onNext}
                  className="rounded-md bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600"
                >
                  {nextLabel}
                </button>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-md bg-stone-800 px-4 py-2 hover:bg-stone-700"
                >
                  Riprova
                </button>
              </>
            ) : (
              <>
                {!showIdea && (
                  <button
                    type="button"
                    onClick={() => setShowIdea(true)}
                    className="rounded-md bg-stone-800 px-3 py-1.5 text-sm hover:bg-stone-700"
                  >
                    Mostra l'idea
                  </button>
                )}
                <button
                  type="button"
                  onClick={retry}
                  disabled={moves.length === 0}
                  className="rounded-md bg-stone-800 px-3 py-1.5 text-sm hover:bg-stone-700 disabled:opacity-40"
                >
                  Ricomincia
                </button>
              </>
            )}
          </div>
        </div>

        {moves.length > 0 && (
          <p className="rounded-lg bg-stone-950/40 p-3 text-sm leading-7 text-stone-300">
            {moves.map((san, i) => (
              <span key={i} className="mr-1.5">
                {figurine(san)}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
