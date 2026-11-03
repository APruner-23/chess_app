import type { Color, Game, GameResult } from '../import/types'

export interface DraftNode {
  san: string
  /** Games that reached this move. */
  games: number
  /** The user's points per game after this move, 0…1. */
  score: number
  /** A move of the user (else an opponent's reply). */
  mine: boolean
  /** The user's move scores poorly over enough games: worth rethinking. */
  weak: boolean
  children: DraftNode[]
}

export interface DraftOptions {
  /** How deep the draft goes, in plies. */
  maxPlies: number
  /** Moves seen fewer times than this are left out. */
  minGames: number
}

export const DEFAULT_DRAFT: DraftOptions = { maxPlies: 16, minGames: 5 }
/** A move of the user is flagged below this score, over at least WEAK_GAMES games. */
const WEAK_SCORE = 0.4
const WEAK_GAMES = 8

interface Trie {
  results: GameResult[]
  next: Map<string, Trie>
}

const points = (rs: readonly GameResult[]) =>
  rs.reduce((a, r) => a + (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0), 0) / rs.length

/**
 * A draft repertoire from the user's own games with one color: at their turn the move
 * they play most often, at the opponent's turn every reply met at least `minGames` times.
 */
export function draftFromGames(
  games: readonly Game[],
  color: Color,
  opts: DraftOptions = DEFAULT_DRAFT,
): DraftNode[] {
  const root: Trie = { results: [], next: new Map() }
  for (const g of games) {
    if (g.userColor !== color) continue
    let node = root
    for (const san of g.moves.slice(0, opts.maxPlies)) {
      let child = node.next.get(san)
      if (!child) {
        child = { results: [], next: new Map() }
        node.next.set(san, child)
      }
      child.results.push(g.result)
      node = child
    }
  }
  const build = (t: Trie, ply: number): DraftNode[] => {
    const mine = (ply % 2 === 0) === (color === 'white')
    const kids = [...t.next.entries()]
      .filter(([, c]) => c.results.length >= opts.minGames)
      .sort((a, b) => b[1].results.length - a[1].results.length)
    return (mine ? kids.slice(0, 1) : kids).map(([san, c]) => {
      const score = points(c.results)
      return {
        san,
        games: c.results.length,
        score,
        mine,
        weak: mine && c.results.length >= WEAK_GAMES && score < WEAK_SCORE,
        children: build(c, ply + 1),
      }
    })
  }
  return build(root, 0)
}

/** Every line from the start to a leaf, most played first (main lines added first). */
export function draftLines(nodes: readonly DraftNode[], prefix: string[] = []): string[][] {
  return nodes.flatMap((n) =>
    n.children.length ? draftLines(n.children, [...prefix, n.san]) : [[...prefix, n.san]],
  )
}

/** Number of moves in the draft. */
export function draftSize(nodes: readonly DraftNode[]): number {
  return nodes.reduce((a, n) => a + 1 + draftSize(n.children), 0)
}
