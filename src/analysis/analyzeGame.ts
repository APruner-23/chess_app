import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import type { Analysis, Eval, Game, PlyEval } from '../import/types'
import { replaySan } from '../chess/position'

export interface PositionEval {
  eval: Eval
  best?: string
}

/** Evaluates one position (FEN); in the app this goes through the engine queue. */
export type Evaluator = (fen: string, signal?: AbortSignal) => Promise<PositionEval>

/** Fixed node budgets: same position, same result, whatever the device speed. */
export const PRESETS = { veloce: 150_000, accurata: 600_000 } as const
export type Preset = keyof typeof PRESETS

/**
 * Evaluates every position of the game. Like Lichess, plies[i] holds the eval after
 * ply i+1 and the best move from the position before it; a final checkmate is not evaluated.
 */
export async function analyzeGame(
  game: Game,
  evaluate: Evaluator,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Analysis | undefined> {
  const { fens } = replaySan(game.moves)
  const finalPos = Chess.fromSetup(parseFen(fens[fens.length - 1]!).unwrap()).unwrap()
  const last = finalPos.isCheckmate() ? fens.length - 2 : fens.length - 1
  const evals: PositionEval[] = []
  for (let i = 0; i <= last; i++) {
    if (opts.signal?.aborted) return undefined
    const pos = Chess.fromSetup(parseFen(fens[i]!).unwrap()).unwrap()
    evals.push(pos.isEnd() ? { eval: { cp: 0 } } : await evaluate(fens[i]!, opts.signal))
    opts.onProgress?.(i + 1, last + 1)
  }
  if (opts.signal?.aborted) return undefined
  const plies: PlyEval[] = evals.slice(1).map((e, i) => ({
    eval: e.eval,
    ...(evals[i]!.best ? { best: evals[i]!.best } : {}),
  }))
  return { id: game.id, source: 'local', plies, updatedAt: Date.now() }
}
