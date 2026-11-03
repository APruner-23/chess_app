import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { phaseOf, type Phase } from '../chess/phase'
import { userAccuracy } from '../feedback/stats'
import type { Analysis, Game } from '../import/types'
import { judgeMoves } from './judgments'
import { winFor } from './winPercent'

export type PhaseTally = Record<
  Phase,
  { moves: number; errors: number; blunders: number; loss: number }
>

/**
 * What the statistics need from one analyzed game, from the user's side: small,
 * derived once per analysis and stored locally (`gameFacts`), so pages with thousands
 * of games don't load and replay every analysis each time they open.
 */
export interface GameFacts {
  /** Same id as the game and the analysis. */
  id: string
  /** The analysis' updatedAt when these facts were derived. */
  updatedAt: number
  accuracy?: number
  /** Plies of the user's mistakes and blunders. */
  errorPlies: number[]
  /** Plies covered by the analysis, and the user's moves among them. */
  plies: number
  userMoves: number
  phases: PhaseTally
}

const isUser = (game: Game, ply: number) => ply % 2 === (game.userColor === 'white' ? 0 : 1)

export function factsOf(game: Game, analysis: Analysis): GameFacts {
  const evals = analysis.plies.map((p) => p.eval)
  const advices = judgeMoves(
    evals,
    analysis.source === 'lichess' ? (p) => analysis.plies[p]!.best !== undefined : undefined,
  )
  const judgment = new Map(advices.map((a) => [a.ply, a.judgment]))
  const phases: PhaseTally = {
    opening: { moves: 0, errors: 0, blunders: 0, loss: 0 },
    middlegame: { moves: 0, errors: 0, blunders: 0, loss: 0 },
    endgame: { moves: 0, errors: 0, blunders: 0, loss: 0 },
  }
  const pos = Chess.default()
  for (let ply = 0; ply < Math.min(game.moves.length, evals.length); ply++) {
    const move = parseSan(pos, game.moves[ply]!)
    if (!move) break
    if (isUser(game, ply)) {
      const r = phases[phaseOf(pos.board, ply)]
      r.moves++
      const j = judgment.get(ply)
      if (j && j !== 'inaccuracy') r.errors++
      if (j === 'blunder') r.blunders++
      const before = ply === 0 ? 50 : winFor(evals[ply - 1]!, game.userColor)
      r.loss += Math.max(0, before - winFor(evals[ply]!, game.userColor))
    }
    pos.play(move)
  }
  const accuracy = userAccuracy(game, analysis)
  return {
    id: game.id,
    updatedAt: analysis.updatedAt,
    ...(accuracy !== undefined ? { accuracy } : {}),
    errorPlies: advices
      .filter((a) => isUser(game, a.ply) && a.judgment !== 'inaccuracy')
      .map((a) => a.ply),
    plies: analysis.plies.length,
    userMoves: analysis.plies.filter((_, i) => isUser(game, i)).length,
    phases,
  }
}

/** Facts for a list of games and analyses (tests and one-off computations). */
export function factsMap(
  games: readonly Game[],
  analyses: ReadonlyMap<string, Analysis>,
): Map<string, GameFacts> {
  const out = new Map<string, GameFacts>()
  for (const g of games) {
    const a = analyses.get(g.id)
    if (a) out.set(g.id, factsOf(g, a))
  }
  return out
}
