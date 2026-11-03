import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import { figurine } from '../chess/figurine'
import { PHASE_LABELS } from '../chess/phase'
import { engineQueue } from '../engine/instance'
import { winFor } from '../analysis/winPercent'
import { MOTIF_ADVICE, MOTIF_LABELS } from '../puzzles/motifs'
import type { Puzzle } from '../puzzles/types'
import { Board } from './Board'
import { formatEval } from './evalFormat'
import { BOARD_COLUMN, SPEED_LABELS, formatDate } from './format'

/** A different move is accepted when it keeps the user's win% within this many points. */
const ALT_TOLERANCE = 3
const CHECK_DEPTH = 16

type State =
  | { kind: 'play' }
  | { kind: 'checking'; fen: string; uci: string }
  | { kind: 'wrong'; san: string; reason: 'game' | 'worse' }
  | { kind: 'solved'; fen: string; uci: string; san: string; alt: boolean }

function play(fen: string, uci: string) {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const move = parseUci(uci)
  if (!move || !pos.isLegal(move)) return undefined
  const san = makeSan(pos, move)
  pos.play(move)
  return { san, fen: makeFen(pos.toSetup()), mate: pos.isCheckmate() }
}

/**
 * Plays puzzles taken from the user's own mistakes. The first attempt decides the
 * answer; a move other than the engine's is checked with Stockfish and accepted
 * when it is about as good.
 */
export function PuzzleTrainer({
  puzzles,
  onAnswer,
  onExit,
}: {
  puzzles: Puzzle[]
  /** Called once per puzzle with the first attempt; omitted in free practice. */
  onAnswer?: (id: string, correct: boolean, elapsedMs: number) => void
  onExit: () => void
}) {
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<State>({ kind: 'play' })
  const [score, setScore] = useState({ right: 0, total: 0 })
  const answered = useRef(false)
  const startedAt = useRef(0)
  const p = puzzles[index]

  useEffect(() => {
    startedAt.current = performance.now()
  }, [])

  const next = () => {
    answered.current = false
    startedAt.current = performance.now()
    setState({ kind: 'play' })
    setIndex((i) => i + 1)
  }

  const answer = useCallback(
    (correct: boolean) => {
      if (answered.current || !p) return
      answered.current = true
      onAnswer?.(p.id, correct, performance.now() - startedAt.current)
      setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
    },
    [p, onAnswer],
  )

  // A move other than the solution: ask the engine whether it is about as good.
  useEffect(() => {
    if (state.kind !== 'checking' || !p) return
    const { fen, uci } = state
    const handle = engineQueue('live').submit({ fen, depth: CHECK_DEPTH }, 'live')
    let live = true
    handle.result.then(
      ({ lines }) => {
        if (!live) return
        const ev = lines[0]?.eval
        const ok =
          ev !== undefined && winFor(ev, p.color) >= winFor(p.evalBefore, p.color) - ALT_TOLERANCE
        const san = play(p.fen, uci)!.san
        answer(ok)
        setState(
          ok
            ? { kind: 'solved', fen, uci, san, alt: true }
            : { kind: 'wrong', san, reason: 'worse' },
        )
      },
      () => {},
    )
    return () => {
      live = false
      handle.cancel()
    }
  }, [state, p, answer])

  const onMove = useCallback(
    (uci: string) => {
      if (!p || (state.kind !== 'play' && state.kind !== 'wrong')) return
      const r = play(p.fen, uci)
      if (!r) return
      if (r.san === p.solutionSan || r.mate) {
        answer(true)
        setState({ kind: 'solved', fen: r.fen, uci, san: r.san, alt: false })
      } else if (r.san === p.played) {
        answer(false)
        setState({ kind: 'wrong', san: r.san, reason: 'game' })
      } else if (state.kind === 'wrong') {
        setState({ kind: 'wrong', san: r.san, reason: 'worse' }) // after a miss, only the solution counts
      } else {
        setState({ kind: 'checking', fen: r.fen, uci })
      }
    },
    [p, state, answer],
  )

  if (!p) {
    return (
      <div className="max-w-md space-y-3 rounded-lg bg-stone-950/40 p-6">
        <h2 className="text-xl font-semibold">Sessione finita</h2>
        {score.total > 0 && (
          <p className="text-stone-300">
            {score.right} risolti al primo colpo su {score.total} (
            {Math.round((score.right / score.total) * 100)}%).
          </p>
        )}
        <button
          type="button"
          onClick={onExit}
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium"
        >
          Torna all'allenamento
        </button>
      </div>
    )
  }

  const side = p.color === 'white' ? 'al Bianco' : 'al Nero'
  const fen = state.kind === 'solved' || state.kind === 'checking' ? state.fen : p.fen
  const lastMove = state.kind === 'solved' || state.kind === 'checking' ? state.uci : p.prevUci
  const moveNo = `${Math.floor(p.ply / 2) + 1}${p.color === 'white' ? '.' : '…'}`
  const bad = p.judgment === 'blunder' ? '??' : '?'

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={BOARD_COLUMN}>
        <Board
          fen={fen}
          orientation={p.color}
          lastMove={lastMove}
          arrows={
            state.kind === 'wrong' || (state.kind === 'solved' && state.alt)
              ? [p.solution]
              : undefined
          }
          onMove={state.kind === 'play' || state.kind === 'wrong' ? onMove : undefined}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-stone-400">
          Puzzle {index + 1} di {puzzles.length}
          {score.total > 0 && ` · ${score.right}/${score.total} al primo colpo`}
        </p>
        <div className="rounded-lg bg-stone-950/40 p-4 text-sm text-stone-400">
          Contro {p.opponent}
          {p.opponentRating ? ` (${p.opponentRating})` : ''} · {formatDate(p.playedAt)} ·{' '}
          {SPEED_LABELS[p.speed]} · {PHASE_LABELS[p.phase]}
        </div>
        <div className="space-y-2 rounded-lg bg-stone-950/40 p-4">
          {state.kind === 'play' && (
            <>
              <p className="text-lg">Tocca {side}: trova la mossa migliore.</p>
              <p className="text-sm text-stone-400">
                In partita qui hai commesso{' '}
                {p.judgment === 'blunder' ? 'un errore grave' : 'un errore'}
                {p.mate ? ' legato a uno scacco matto' : ''}.
              </p>
            </>
          )}
          {state.kind === 'checking' && (
            <p className="text-lg text-stone-300">Controllo la mossa…</p>
          )}
          {state.kind === 'wrong' && (
            <>
              <p className="text-lg text-red-300">
                {state.reason === 'game'
                  ? `${figurine(state.san)} è proprio la mossa della partita.`
                  : `${figurine(state.san)} non basta.`}{' '}
                La migliore era <span className="font-semibold">{figurine(p.solutionSan)}</span>:
                giocala sulla scacchiera.
              </p>
            </>
          )}
          {state.kind === 'solved' && (
            <>
              <p className="text-lg text-emerald-400">
                {state.alt
                  ? `Va bene anche ${figurine(state.san)}: il motore preferiva ${figurine(p.solutionSan)}.`
                  : `Giusto: ${figurine(state.san)}`}
              </p>
              <p className="text-sm text-stone-300">
                In partita: {moveNo} {figurine(p.played)}
                {bad} ({formatEval(p.evalBefore)} → {formatEval(p.evalAfter)}).
              </p>
              <p className="text-sm text-stone-400">
                Tema: <span className="text-stone-200">{MOTIF_LABELS[p.motif]}</span> ·{' '}
                {MOTIF_ADVICE[p.motif]}.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={next}
                  className="rounded-md bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600"
                >
                  Avanti
                </button>
                <Link
                  to={`/partite/${encodeURIComponent(p.gameId)}?ply=${p.ply}`}
                  className="rounded-md bg-stone-800 px-4 py-2 hover:bg-stone-700"
                >
                  Apri la partita
                </Link>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md bg-stone-800 px-3 py-1.5 text-sm"
        >
          Interrompi
        </button>
      </div>
    </div>
  )
}
