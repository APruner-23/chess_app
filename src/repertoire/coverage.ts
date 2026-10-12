import { INITIAL_EPD } from '../chess/position'
import type { Color } from '../import/types'
import { RepGraph, turnOf } from './graph'

export interface MoveFreq {
  san: string
  games: number
}

/** Opponent move frequencies for a position (from the explorer cache), if known. */
export type FreqLookup = (epd: string) => MoveFreq[] | undefined

export interface Hole {
  epd: string
  /** Unprepared opponent move; undefined when the user's own answer is missing. */
  san?: string
  /** Probability of reaching the position while following the repertoire. */
  reach: number
  /** Share of games where the opponent plays this move there. */
  share: number
  /** reach × share: how often this hole shows up in practice. */
  score: number
  /** SAN moves leading to the position (one of the paths). */
  path: string[]
}

export interface Coverage {
  /** byMove[n-1] = probability of still being in preparation after n full moves. */
  byMove: number[]
  holes: Hole[]
  /** Opponent positions without explorer data (treated as evenly split). */
  missing: string[]
}

/**
 * Whether only the prepared opponent moves count at this position: White's first move
 * in a Black repertoire, as long as the repertoire answers at least one.
 */
export function isScoped(graph: RepGraph, color: Color, epd: string): boolean {
  return color === 'black' && epd === INITIAL_EPD && graph.children(epd).length > 0
}

/** Ignore opponent moves played in under 1% of games. */
const MIN_SHARE = 0.01

/**
 * Walks the repertoire assuming the user always plays the main move and the
 * opponent follows the explorer frequencies.
 */
export function coverage(
  graph: RepGraph,
  color: Color,
  freqs: FreqLookup,
  maxMoves = 10,
  root = INITIAL_EPD,
): Coverage {
  const maxPly = maxMoves * 2
  const inBook = new Array<number>(maxPly + 1).fill(0)
  const holes = new Map<string, Hole>()
  const missing = new Set<string>()

  const walk = (epd: string, p: number, ply: number, path: string[], seen: Set<string>) => {
    inBook[ply]! += p
    if (ply >= maxPly || p < 1e-6 || seen.has(epd)) return
    const children = graph.children(epd)
    const next = (move: { toEpd: string; san: string }, q: number) =>
      walk(move.toEpd, q, ply + 1, [...path, move.san], new Set(seen).add(epd))
    if (turnOf(epd) === color) {
      if (children[0]) next(children[0], p)
      else if (ply > 0) addHole(epd, undefined, p, 1, path)
      return
    }
    const known = freqs(epd)
    if (!known) {
      missing.add(epd)
      for (const c of children) next(c, p / children.length)
      return
    }
    // A Black repertoire answers only the first moves it contains (a Caro-Kann
    // repertoire is about 1.e4): other first moves belong to other repertoires.
    const scoped = ply === 0 && isScoped(graph, color, epd)
    const counted = scoped ? known.filter((f) => children.some((c) => c.san === f.san)) : known
    const total = counted.reduce((a, f) => a + f.games, 0)
    if (scoped && total === 0) {
      for (const c of children) next(c, p / children.length)
      return
    }
    for (const f of counted) {
      const share = total ? f.games / total : 0
      const child = children.find((c) => c.san === f.san)
      if (child) next(child, p * share)
      else if (share >= MIN_SHARE) addHole(epd, f.san, p, share, path)
    }
  }
  const addHole = (
    epd: string,
    san: string | undefined,
    p: number,
    share: number,
    path: string[],
  ) => {
    const key = `${epd}|${san ?? ''}`
    const hole = holes.get(key)
    if (hole) {
      hole.reach += p
      hole.score = hole.reach * share
    } else holes.set(key, { epd, ...(san ? { san } : {}), reach: p, share, score: p * share, path })
  }
  walk(root, 1, 0, [], new Set())

  return {
    byMove: Array.from({ length: maxMoves }, (_, i) => Math.min(1, inBook[2 * (i + 1)]!)),
    holes: [...holes.values()].sort((a, b) => b.score - a.score),
    missing: [...missing],
  }
}

/**
 * Probability of reaching each user position when following the repertoire (used to
 * introduce the most likely positions first). Without explorer data the opponent's
 * prepared moves are treated as equally likely.
 */
export function reachProbabilities(
  graph: RepGraph,
  color: Color,
  freqs: FreqLookup,
  maxPly = 30,
  root = INITIAL_EPD,
): Map<string, number> {
  const reach = new Map<string, number>()
  const walk = (epd: string, p: number, ply: number, seen: Set<string>) => {
    if (ply > maxPly || p < 1e-9 || seen.has(epd)) return
    const children = graph.children(epd)
    if (children.length === 0) return
    const nextSeen = new Set(seen).add(epd)
    if (turnOf(epd) === color) {
      reach.set(epd, (reach.get(epd) ?? 0) + p)
      walk(children[0]!.toEpd, p, ply + 1, nextSeen)
      return
    }
    const scoped = ply === 0 && isScoped(graph, color, epd)
    const known = freqs(epd)?.filter((f) => !scoped || children.some((c) => c.san === f.san))
    const total = known?.reduce((a, f) => a + f.games, 0) ?? 0
    for (const c of children) {
      const games = known?.find((f) => f.san === c.san)?.games
      const share = known && total ? (games ?? 0) / total : 1 / children.length
      walk(c.toEpd, p * share, ply + 1, nextSeen)
    }
  }
  walk(root, 1, 0, new Set())
  return reach
}
