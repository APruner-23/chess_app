import {
  ChildNode,
  defaultGame,
  makePgn,
  parsePgn,
  type Node,
  type PgnNodeData,
} from 'chessops/pgn'
import { INITIAL_EPD } from '../chess/position'
import { RepGraph, makeRepMove } from './graph'
import type { RepMove, Repertoire } from './types'

/** All moves of all games in a PGN (variations included), from the standard start. */
export function importPgn(repertoireId: string, pgn: string): RepMove[] {
  const byId = new Map<string, RepMove>()
  const counts = new Map<string, number>()
  for (const game of parsePgn(pgn)) {
    const fen = game.headers.get('FEN')
    if (fen && !fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')) continue
    const walk = (node: Node<PgnNodeData>, epd: string) => {
      for (const child of node.children) {
        const order = counts.get(epd) ?? 0
        const note = child.data.comments
          ?.join(' ')
          .replace(/\[%[^\]]*\]/g, '')
          .trim()
        const move = makeRepMove(repertoireId, epd, child.data.san, order, note || undefined)
        if (!move) break // illegal move: drop this branch
        if (!byId.has(move.id)) {
          byId.set(move.id, move)
          counts.set(epd, order + 1)
        }
        walk(child, move.toEpd)
      }
    }
    walk(game.moves, INITIAL_EPD)
  }
  return [...byId.values()]
}

/** One PGN game with variations; transposed positions are expanded only once. */
export function exportPgn(repertoire: Repertoire, moves: readonly RepMove[]): string {
  const graph = new RepGraph(moves)
  const game = defaultGame<PgnNodeData>()
  game.headers.set('Event', repertoire.name)
  game.headers.set('Site', 'chess_app')
  game.headers.delete('Date')
  game.headers.delete('Round')
  game.headers.set('White', repertoire.color === 'white' ? 'Repertorio' : '?')
  game.headers.set('Black', repertoire.color === 'black' ? 'Repertorio' : '?')
  const expanded = new Set<string>()
  const build = (node: Node<PgnNodeData>, epd: string) => {
    expanded.add(epd)
    for (const m of graph.children(epd)) {
      const child = new ChildNode<PgnNodeData>({
        san: m.san,
        ...(m.note ? { comments: [m.note] } : {}),
      })
      node.children.push(child)
      if (!expanded.has(m.toEpd)) build(child, m.toEpd)
    }
  }
  build(game.moves, INITIAL_EPD)
  return makePgn(game)
}

/** "https://lichess.org/study/abcd1234[/chapter]" → PGN export URL, or undefined. */
export function studyPgnUrl(url: string): string | undefined {
  const m = url.trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/)
  if (!m) return undefined
  return m[2]
    ? `https://lichess.org/api/study/${m[1]}/${m[2]}.pgn`
    : `https://lichess.org/api/study/${m[1]}.pgn`
}
