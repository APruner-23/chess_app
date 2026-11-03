import { describe, expect, it } from 'vitest'
import { INITIAL_EPD } from '../../src/chess/position'
import type { Game, GameResult } from '../../src/import/types'
import { RepGraph, makeRepMove } from '../../src/repertoire/graph'
import type { RepMove, Repertoire } from '../../src/repertoire/types'
import { scoutReport } from '../../src/scouting/report'

let n = 0
const g = (moves: string, userColor: 'white' | 'black', result: GameResult = 'win') =>
  ({ id: `g${n++}`, speed: 'blitz', userColor, result, moves: moves.split(' ') }) as Game

function rep(id: string, color: 'white' | 'black', lines: string[]) {
  const moves: RepMove[] = []
  for (const line of lines) {
    let epd = INITIAL_EPD
    for (const san of line.split(' ')) {
      const m = makeRepMove(id, epd, san, moves.filter((x) => x.fromEpd === epd).length)!
      if (!moves.some((x) => x.id === m.id)) moves.push(m)
      epd = m.toEpd
    }
  }
  const repertoire: Repertoire = {
    id,
    name: id,
    color,
    experimental: false,
    createdAt: 0,
    updatedAt: 0,
  }
  return { repertoire, graph: new RepGraph(moves) }
}

describe('scouting report', () => {
  // The user is Black with the Caro-Kann; the scouted player is White.
  const caro = rep('caro', 'black', ['e4 c6 d4 d5 e5 Bf5'])
  const games = [
    g('e4 c6 d4 d5 e5 Bf5 Nf3', 'white'), // follows the repertoire to its end
    g('e4 c6 Nc3 d5', 'white', 'loss'), // 2.Nc3: not prepared
    g('e4 c6 Nc3 d5', 'white'),
    g('d4 d5 c4', 'white'), // 1.d4: no answer at all
    g('e4 e5 Nf3', 'white'), // their opponent left the repertoire: not a hole
    g('e4 c5', 'black'), // they are Black: irrelevant for a Black repertoire
  ]

  it('finds the scouted player’s moves the repertoire does not answer', () => {
    const r = scoutReport(games, [caro])
    expect(r.games).toBe(6)
    expect(r.holes.map((h) => [h.path.join(' '), h.san, h.games])).toEqual([
      ['e4 c6', 'Nc3', 2],
      ['', 'd4', 1],
    ])
    expect(r.meetings).toBe(3)
    expect(r.score.games).toBe(6)
    expect(r.speeds.get('blitz')).toBe(6)
  })
})
