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
    const total = known.reduce((a, f) => a + f.games, 0)
    for (const f of known) {
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
