import { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { makeUci, parseUci } from 'chessops'
import { judgeMoves } from '../analysis/judgments'
import { INITIAL_EVAL, winFor } from '../analysis/winPercent'
import { phaseOf } from '../chess/phase'
import type { Analysis, Game } from '../import/types'
import { classifyPuzzle } from './motifs'
import type { Puzzle } from './types'

/** Below this win% (user's side) the position was already lost: not worth a puzzle. */
export const MIN_WIN_BEFORE = 20

/**
 * Puzzles from one analyzed game: every mistake or blunder of the user for which the
 * analysis knows a better move, unless the position was already lost.
 */
export function extractPuzzles(game: Game, analysis: Analysis): Puzzle[] {
  const evals = analysis.plies.map((p) => p.eval)
  const judged =
    analysis.source === 'lichess' ? (p: number) => analysis.plies[p]!.best !== undefined : undefined
  const advices = judgeMoves(evals, judged).filter(
    (a) => a.color === game.userColor && a.judgment !== 'inaccuracy',
  )
  if (advices.length === 0) return []
  const wanted = new Set(advices.map((a) => a.ply))
  const last = Math.max(...wanted)

  const pos = Chess.default()
  const puzzles: Puzzle[] = []
  let prevUci: string | undefined
  for (let ply = 0; ply <= last; ply++) {
    const move = parseSan(pos, game.moves[ply]!)
    if (!move) break
    const advice = wanted.has(ply) ? advices.find((a) => a.ply === ply)! : undefined
    const best = analysis.plies[ply]?.best
    const bestMove = best ? parseUci(best) : undefined
    if (advice && bestMove && pos.isLegal(bestMove)) {
      const evalBefore = ply === 0 ? INITIAL_EVAL : evals[ply - 1]!
      const solutionSan = makeSan(pos, bestMove)
      if (solutionSan !== game.moves[ply] && winFor(evalBefore, game.userColor) >= MIN_WIN_BEFORE) {
        const opp = game.userColor === 'white' ? game.black : game.white
        const fen = makeFen(pos.toSetup())
        const evalAfter = evals[ply]!
        const phase = phaseOf(pos.board, ply)
        puzzles.push({
          id: `${game.id}|${ply}`,
          gameId: game.id,
          ply,
          fen,
          ...(prevUci ? { prevUci } : {}),
          solution: best!,
          solutionSan,
          played: game.moves[ply]!,
          judgment: advice.judgment as 'mistake' | 'blunder',
          mate: advice.mate,
          evalBefore,
          evalAfter,
          motif: classifyPuzzle({
            fen,
            solution: best!,
            played: game.moves[ply]!,
            color: game.userColor,
            evalBefore,
            evalAfter,
            endgame: phase === 'endgame',
          }),
          color: game.userColor,
          phase,
          playedAt: game.playedAt,
          speed: game.speed,
          opponent: opp.name,
          ...(opp.rating ? { opponentRating: opp.rating } : {}),
        })
      }
    }
    prevUci = makeUci(move)
    pos.play(move)
  }
  return puzzles
}
