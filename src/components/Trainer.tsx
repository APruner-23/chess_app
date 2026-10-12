import { useCallback, useEffect, useRef, useState } from 'react'
import { parseUci } from 'chessops'
import { makeSan } from 'chessops/san'
import { figurine } from '../chess/figurine'
import { positionFromEpd } from '../repertoire/graph'
import type { TrainingLine } from '../training/prepare'
import { Board } from './Board'

type Phase = 'play' | 'wrong' | 'correct'

interface TrainerProps {
  lines: TrainingLine[]
  /** Called once per quizzed or learned card: the first attempt decides. */
  onAnswer: (cardId: string, correct: boolean, elapsedMs: number) => void
  onExit: () => void
}

const AUTO_DELAY = 450

/** Plays training lines: the app makes the automatic moves, the user finds the others. */
export function Trainer({ lines, onAnswer, onExit }: TrainerProps) {
  const [pos, setPos] = useState({ line: 0, step: 0 })
  const [phase, setPhase] = useState<Phase>('play')
  const [score, setScore] = useState({ right: 0, total: 0 })
  const startedAt = useRef(0)
  const answered = useRef(false)

  const line = lines[pos.line]
  const step = line?.steps[pos.step]

  const advance = useCallback(() => {
    setPhase('play')
    answered.current = false
    setPos((p) => {
      const steps = lines[p.line]!.steps
      return p.step + 1 < steps.length
        ? { line: p.line, step: p.step + 1 }
        : { line: p.line + 1, step: 0 }
    })
  }, [lines])

  // Automatic moves play themselves; the clock starts when it's the user's turn.
  useEffect(() => {
    if (!step) return
    if (step.kind === 'auto') {
      const t = setTimeout(advance, AUTO_DELAY)
      return () => clearTimeout(t)
    }
    startedAt.current = performance.now()
  }, [step, advance])

  const onMove = useCallback(
    (uci: string) => {
      if (!step || step.kind === 'auto' || phase === 'correct') return
      const p = positionFromEpd(step.move.fromEpd)
      const move = parseUci(uci)
      const san = move && p.isLegal(move) ? makeSan(p, move) : undefined
      const correct = san === step.move.san
      if (!answered.current && step.cardId) {
        answered.current = true
        onAnswer(step.cardId, correct, performance.now() - startedAt.current)
        setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
      }
      if (correct) {
        setPhase('correct')
        setTimeout(advance, AUTO_DELAY)
      } else setPhase('wrong')
    },
    [step, phase, onAnswer, advance],
  )

  if (!line || !step) {
    return (
      <div className="max-w-md space-y-3 rounded-lg bg-stone-950/40 p-6">
        <h2 className="text-xl font-semibold">Sessione finita</h2>
        {score.total > 0 && (
          <p className="text-stone-300">
            {score.right} giuste su {score.total} ({Math.round((score.right / score.total) * 100)}
            %).
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

  const showAnswer = step.kind === 'learn' || phase === 'wrong'
  const prev = pos.step > 0 ? line.steps[pos.step - 1]!.move.uci : undefined
  const fen = phase === 'correct' ? `${step.move.toEpd} 0 1` : `${step.move.fromEpd} 0 1`
  const moveNo = (() => {
    const ply = pos.step
    return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`
  })()

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="w-full max-w-[min(100%,calc(100vh-12rem))]">
        <Board
          fen={fen}
          orientation={line.color}
          lastMove={phase === 'correct' ? step.move.uci : prev}
          arrows={showAnswer && phase !== 'correct' ? [step.move.uci] : undefined}
          onMove={step.kind === 'auto' || phase === 'correct' ? undefined : onMove}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-stone-400">
          Linea {pos.line + 1} di {lines.length}
          {score.total > 0 && ` · ${score.right}/${score.total} giuste`}
        </p>
        <div className="rounded-lg bg-stone-950/40 p-4">
          {step.kind === 'auto' ? (
            <p className="text-stone-400">…</p>
          ) : phase === 'correct' ? (
            <p className="text-lg text-emerald-400">Giusto: {figurine(step.move.san)}</p>
          ) : phase === 'wrong' ? (
            <p className="text-lg text-red-300">
              No: qui si gioca <span className="font-semibold">{figurine(step.move.san)}</span>.
              Rigiocala.
            </p>
          ) : step.kind === 'learn' ? (
            <p className="text-lg">
              Nuova posizione: qui giochi{' '}
              <span className="font-semibold">
                {moveNo} {figurine(step.move.san)}
              </span>
              . Giocala sulla scacchiera.
            </p>
          ) : line.recall ? (
            <p className="text-lg">Ora a memoria: qual è la tua mossa?</p>
          ) : (
            <p className="text-lg">Tocca a te: qual è la tua mossa?</p>
          )}
          {showAnswer && step.move.note && (
            <p className="mt-2 text-stone-300">💡 {step.move.note}</p>
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
