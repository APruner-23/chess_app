import { INITIAL_EPD } from '../chess/position'
import type { Color } from '../import/types'
import { RepGraph, turnOf } from '../repertoire/graph'
import { cardId } from './cards'
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
 * Every saved line of a repertoire, from the start to each leaf: the user plays their
 * main move, the app plays every prepared opponent reply in turn. All the user's moves
 * are quizzed, in every line (free practice, so repeating a shared start is fine).
 */
export function allLines(graph: RepGraph, color: Color, repertoireId: string): Step[][] {
  const lines: Step[][] = []
  const walk = (epd: string, path: RepMove[], seen: Set<string>) => {
    const own = turnOf(epd) === color
    const next = own ? graph.children(epd).slice(0, 1) : graph.children(epd)
    const fresh = next.filter((m) => !seen.has(m.toEpd))
    if (fresh.length === 0) {
      if (path.some((m) => turnOf(m.fromEpd) === color))
        lines.push(
          path.map((move) =>
            turnOf(move.fromEpd) === color
              ? { move, kind: 'quiz', cardId: cardId(repertoireId, move.fromEpd) }
              : { move, kind: 'auto' },
          ),
        )
      return
    }
    for (const m of fresh) walk(m.toEpd, [...path, m], new Set(seen).add(m.toEpd))
  }
  walk(INITIAL_EPD, [], new Set([INITIAL_EPD]))
  return lines
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
