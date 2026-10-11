import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import { replaySan } from '../chess/position'
import type { Analysis, Game } from '../import/types'
import { judgeMoves } from '../analysis/judgments'
import { RepGraph, positionFromEpd, turnOf } from '../repertoire/graph'
import type { Repertoire } from '../repertoire/types'
import type { FeedbackItem, FeedbackKind } from './types'

/** Mistakes up to this many plies after the book ends trigger an "extend" proposal. */
export const EXTEND_WINDOW = 16

export interface RepertoireWithGraph {
  repertoire: Repertoire
  graph: RepGraph
}

interface Walk {
  rep: RepertoireWithGraph
  /** Plies played inside the repertoire. */
  bookPlies: number
  /** Why the walk stopped: the game left the book on this ply. */
  kind: 'deviation' | 'hole' | 'end'
}

/** Follows the game through one repertoire until it leaves the book. */
function walk(rep: RepertoireWithGraph, game: Game, epds: string[]): Walk {
  const color = rep.repertoire.color
  for (let ply = 0; ply < game.moves.length; ply++) {
    const children = rep.graph.children(epds[ply]!)
    if (children.length === 0) return { rep, bookPlies: ply, kind: 'end' }
    if (!children.some((m) => m.san === game.moves[ply])) {
      return { rep, bookPlies: ply, kind: turnOf(epds[ply]!) === color ? 'deviation' : 'hole' }
    }
  }
  return { rep, bookPlies: game.moves.length, kind: 'end' }
}

/**
 * Compares a game with the user's repertoires of the same color and returns the
 * feedback it produces. The repertoire followed the longest is the reference.
 */
export function compareGame(
  game: Game,
  repertoires: readonly RepertoireWithGraph[],
  analysis?: Analysis,
): FeedbackItem[] {
  const candidates = repertoires.filter((r) => r.repertoire.color === game.userColor)
  if (candidates.length === 0) return []
  const { epds } = replaySan(game.moves)
  const best = candidates
    .map((r) => walk(r, game, epds))
    .sort((a, b) => b.bookPlies - a.bookPlies)[0]!
  if (best.bookPlies === 0 && best.kind === 'end') return [] // empty repertoire
  const rep = best.rep.repertoire
  const ply = best.bookPlies
  const evalAt = (p: number) => (p > 0 ? analysis?.plies[p - 1]?.eval : undefined)
  const exitEval = evalAt(ply)
  const now = Date.now()
  const item = (
    kind: FeedbackKind,
    at: number,
    extra: Partial<FeedbackItem> = {},
  ): FeedbackItem => ({
    id: `${game.id}|${rep.id}|${kind}`,
    gameId: game.id,
    repertoireId: rep.id,
    kind,
    ply: at,
    epd: epds[at]!,
    path: game.moves.slice(0, at),
    ...(game.moves[at] ? { san: game.moves[at] } : {}),
    ...(exitEval ? { exitEval } : {}),
    bookPlies: ply,
    result: game.result,
    playedAt: game.playedAt,
    status: 'open',
    updatedAt: now,
    ...extra,
  })

  const items: FeedbackItem[] = [item('exit', ply, { status: 'info' })]
  // Inbox items only for games played after the repertoire existed.
  if (game.playedAt < rep.createdAt) return items

  if (best.kind === 'deviation') {
    items.push(item('deviation', ply, { expectedSan: best.rep.graph.children(epds[ply]!)[0]!.san }))
  } else if (best.kind === 'hole') {
    items.push(item('hole', ply))
  }

  if (analysis) {
    const evals = analysis.plies.map((p) => p.eval)
    const judged =
      analysis.source === 'lichess'
        ? (p: number) => analysis.plies[p]!.best !== undefined
        : undefined
    const mistake = judgeMoves(evals, judged).find(
      (a) =>
        a.color === game.userColor &&
        a.judgment !== 'inaccuracy' &&
        a.ply >= ply &&
        a.ply < ply + EXTEND_WINDOW,
    )
    const bestUci = mistake ? analysis.plies[mistake.ply]?.best : undefined
    const move = bestUci ? parseUci(bestUci) : undefined
    if (mistake && move) {
      const pos = positionFromEpd(epds[mistake.ply]!)
      if (pos.isLegal(move))
        items.push(item('extend', mistake.ply, { bestSan: makeSan(pos, move) }))
    }
  }
  return items
}

/** Inbox grouping key: same repertoire, position, kind and move. */
export function groupKey(f: FeedbackItem): string {
  return `${f.repertoireId}|${f.epd}|${f.kind}|${f.san ?? ''}`
}
