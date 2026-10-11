import { INITIAL_EPD } from '../chess/position'
import { RepGraph } from '../repertoire/graph'
import type { RepMove } from '../repertoire/types'

/** One ply of a training line. */
export interface Step {
  move: RepMove
  /** auto: the app plays it; quiz: the user must find it; learn: shown first, then played. */
  kind: 'auto' | 'quiz' | 'learn'
  cardId?: string
}

/** Shortest path of repertoire moves from the start to `epd`, preferring main moves. */
export function pathTo(graph: RepGraph, epd: string, root = INITIAL_EPD): RepMove[] | undefined {
  const prev = new Map<string, RepMove | null>([[root, null]])
  const queue = [root]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === epd) break
    for (const m of graph.children(cur)) {
      if (prev.has(m.toEpd)) continue
      prev.set(m.toEpd, m)
      queue.push(m.toEpd)
    }
  }
  if (!prev.has(epd)) return undefined
  const path: RepMove[] = []
  for (let m = prev.get(epd); m; m = prev.get(m.fromEpd)) path.unshift(m)
  return path
}

/**
 * Groups target positions into lines from the start. Deepest targets go first and
 * every target on the way is quizzed in the same line, so each card appears once.
 */
export function buildLines(
  graph: RepGraph,
  targets: ReadonlyMap<string, string>,
  kind: 'quiz' | 'learn',
): Step[][] {
  const paths = [...targets.keys()]
    .map((epd) => ({ epd, path: pathTo(graph, epd) }))
    .filter((p): p is { epd: string; path: RepMove[] } => p.path !== undefined)
    .sort((a, b) => b.path.length - a.path.length)
  const covered = new Set<string>()
  const lines: Step[][] = []
  for (const { epd, path } of paths) {
    if (covered.has(epd)) continue
    const main = graph.children(epd)[0]
    if (!main) continue
    const moves = [...path, main]
    lines.push(
      moves.map((move) => {
        const cardId = targets.get(move.fromEpd)
        if (
          cardId &&
          !covered.has(move.fromEpd) &&
          graph.children(move.fromEpd)[0]?.id === move.id
        ) {
          covered.add(move.fromEpd)
          return { move, kind, cardId }
        }
        return { move, kind: 'auto' }
      }),
    )
  }
  return lines
}
