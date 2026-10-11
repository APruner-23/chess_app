import { describe, expect, it } from 'vitest'
import { INITIAL_EPD, replaySan } from '../../src/chess/position'
import { RepGraph, makeRepMove } from '../../src/repertoire/graph'
import { coverage, type MoveFreq } from '../../src/repertoire/coverage'
import { exportPgn, importPgn, studyPgnUrl } from '../../src/repertoire/pgnIO'
import type { RepMove, Repertoire } from '../../src/repertoire/types'
import { myGamesMoves } from '../../src/openings/myGames'
import type { GamePosition } from '../../src/db/schema'

/** Adds a line of SAN moves (order 0 unless the edge already exists) to a move list. */
function line(moves: RepMove[], sans: string[], rep = 'r') {
  let epd = INITIAL_EPD
  for (const san of sans) {
    const order = moves.filter((m) => m.fromEpd === epd).length
    const m = makeRepMove(rep, epd, san, order)!
    if (!moves.some((x) => x.id === m.id)) moves.push(m)
    epd = m.toEpd
  }
  return moves
}

describe('repertoire graph', () => {
  it('builds canonical edges with deterministic ids', () => {
    const m = makeRepMove('r', INITIAL_EPD, 'Nf3', 0)!
    expect(m).toMatchObject({
      id: `r|${INITIAL_EPD}|g1f3`,
      san: 'Nf3',
      toEpd: replaySan(['Nf3']).epds[1],
    })
    expect(makeRepMove('r', INITIAL_EPD, 'Ke2', 0)).toBeUndefined()
  })

  it('merges transpositions into one position', () => {
    const moves = line(line([], ['d4', 'Nf6', 'c4', 'e6']), ['c4', 'e6', 'd4', 'Nf6'])
    const g = new RepGraph(moves)
    const after = replaySan(['d4', 'Nf6', 'c4', 'e6']).epds[4]!
    expect(g.reachable().epds.has(after)).toBe(true)
    expect(moves.filter((m) => m.toEpd === after)).toHaveLength(2)
  })

  it('lists user positions with their main move and finds orphans', () => {
    const moves = line(line([], ['e4', 'c5', 'Nf3']), ['e4', 'e5', 'Nf3'])
    const g = new RepGraph(moves)
    expect(
      g
        .userPositions('white')
        .map((p) => p.move.san)
        .sort(),
    ).toEqual(['Nf3', 'Nf3', 'e4'])
    const withoutE5 = new RepGraph(moves.filter((m) => m.san !== 'e5'))
    expect(withoutE5.orphans().map((m) => m.san)).toEqual(['Nf3'])
  })
})

describe('coverage', () => {
  // White repertoire: 1.e4, answering 1...c5 with 2.Nf3 and nothing against 1...e5.
  const moves = line(line([], ['e4', 'c5', 'Nf3']), ['e4', 'e5'])
  const g = new RepGraph(moves.filter((m) => m.san !== 'e5'))
  const afterE4 = replaySan(['e4']).epds[1]!
  const freqs = (epd: string): MoveFreq[] | undefined =>
    epd === afterE4
      ? [
          { san: 'c5', games: 60 },
          { san: 'e5', games: 30 },
          { san: 'a6', games: 5 },
          { san: 'h5', games: 5 },
        ]
      : undefined

  it('gives the probability of staying in preparation, move by move', () => {
    const c = coverage(g, 'white', freqs, 3)
    expect(c.byMove[0]).toBeCloseTo(0.6)
    expect(c.byMove[1]).toBeCloseTo(0) // after 2.Nf3 the repertoire ends: Black's 2nd move is unknown
  })

  it('ranks holes by reach × frequency', () => {
    const c = coverage(g, 'white', freqs, 3)
    expect(c.holes.map((h) => [h.san, h.score])).toEqual([
      ['e5', 0.3],
      ['a6', 0.05],
      ['h5', 0.05],
    ])
    expect(c.holes[0]!.path).toEqual(['e4'])
    expect(c.missing).toContain(replaySan(['e4', 'c5', 'Nf3']).epds[3])
  })

  it('reports positions where the user’s own answer is missing', () => {
    const c = coverage(new RepGraph(moves), 'white', freqs, 3)
    const own = c.holes.find((h) => h.san === undefined)
    expect(own).toMatchObject({ path: ['e4', 'e5'], score: 0.3 })
  })
})

describe('PGN import/export', () => {
  const rep: Repertoire = {
    id: 'r',
    name: 'Prova',
    color: 'white',
    experimental: false,
    createdAt: 0,
    updatedAt: 0,
  }
  const pgn = '1. e4 { Centro } e5 (1... c5 2. Nf3 { Sviluppo } d6) 2. Nf3 Nc6 *'

  it('imports variations and comments as notes', () => {
    const moves = importPgn('r', pgn)
    const g = new RepGraph(moves)
    const afterE4 = replaySan(['e4']).epds[1]!
    expect(g.children(INITIAL_EPD)[0]).toMatchObject({ san: 'e4', note: 'Centro' })
    expect(g.children(afterE4).map((m) => m.san)).toEqual(['e5', 'c5'])
    expect(moves).toHaveLength(7)
  })

  it('round-trips through export', () => {
    const moves = importPgn('r', pgn)
    const out = exportPgn(rep, moves)
    expect(out).toContain('[Event "Prova"]')
    expect(
      importPgn('r', out)
        .map((m) => m.id)
        .sort(),
    ).toEqual(moves.map((m) => m.id).sort())
  })

  it('recognizes Lichess study URLs', () => {
    expect(studyPgnUrl('https://lichess.org/study/AbCd1234')).toBe(
      'https://lichess.org/api/study/AbCd1234.pgn',
    )
    expect(studyPgnUrl('lichess.org/study/AbCd1234/EfGh5678')).toBe(
      'https://lichess.org/api/study/AbCd1234/EfGh5678.pgn',
    )
    expect(studyPgnUrl('https://example.com')).toBeUndefined()
  })
})

describe('my games from a position', () => {
  it('groups by move with results', () => {
    const row = (san: string | undefined, result: GamePosition['result']) =>
      ({ san, result }) as GamePosition
    const stats = myGamesMoves([
      row('e4', 'win'),
      row('e4', 'loss'),
      row('d4', 'draw'),
      row(undefined, 'win'),
    ])
    expect(stats).toEqual([
      { san: 'e4', games: 2, wins: 1, draws: 0, losses: 1 },
      { san: 'd4', games: 1, wins: 0, draws: 1, losses: 0 },
    ])
  })
})
