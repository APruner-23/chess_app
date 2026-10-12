import { describe, expect, it } from 'vitest'
import { formatTimeControl } from '../../src/components/format'
import { parseFen } from 'chessops/fen'
import { endPhase, phaseOf } from '../../src/chess/phase'
import { pvMoves } from '../../src/chess/pv'
import { replaySan, replaySanFrom } from '../../src/chess/position'
import { classifyMove, moveQualities } from '../../src/analysis/quality'
import type { Advice } from '../../src/analysis/judgments'

describe('formatTimeControl', () => {
  it('shows minutes + increment seconds', () => {
    expect(formatTimeControl('180+2')).toBe('3+2')
    expect(formatTimeControl('600')).toBe('10+0')
    expect(formatTimeControl('30')).toBe('½+0')
    expect(formatTimeControl('90+1')).toBe('1.5+1')
    expect(formatTimeControl('1/86400')).toBe('1 g')
    expect(formatTimeControl('-')).toBe('-')
  })
})

describe('endPhase', () => {
  it('tells opening, middlegame and endgame apart', () => {
    expect(endPhase(['f3', 'e5', 'g4', 'Qh4#'])).toBe('opening')
    // 13 moves each with all the pieces still on the board.
    const shuffle = Array.from({ length: 26 }, (_, i) =>
      i % 4 === 0 ? 'Nf3' : i % 4 === 1 ? 'Nf6' : i % 4 === 2 ? 'Ng1' : 'Ng8',
    )
    expect(endPhase(shuffle)).toBe('middlegame')
    const rookEnding = parseFen('8/5k2/8/8/8/8/2R2K2/8 w - - 0 50').unwrap().board
    expect(phaseOf(rookEnding, 98)).toBe('endgame')
  })
})

describe('pvMoves', () => {
  it('numbers the moves and handles both castling notations', () => {
    const fen = replaySan(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']).fens[6]!
    expect(pvMoves(fen, ['e1g1', 'g8f6'])).toEqual([
      { san: 'O-O', label: '4.' },
      { san: 'Nf6', label: '' },
    ])
    expect(pvMoves(fen, ['e1h1'])[0]!.san).toBe('O-O')
    const black = replaySan(['e4']).fens[1]!
    expect(pvMoves(black, ['e7e5', 'g1f3']).map((m) => m.label)).toEqual(['1…', '2.'])
  })

  it('replays a variation from any position', () => {
    const fen = replaySan(['e4', 'e5']).fens[2]!
    expect(replaySanFrom(fen, ['Nf3', 'Nc6']).ucis).toEqual(['g1f3', 'b8c6'])
  })
})

describe('moveQualities', () => {
  it('labels book, best, excellent and good moves, skipping judged ones', () => {
    const evals = [
      { cp: 20 }, // ply 0: book
      { cp: 20 }, // ply 1: best
      { cp: 30 }, // ply 2: excellent (white gains)
      { cp: 70 }, // ply 3: black drops ~3.6 win% points: good
      { cp: 600 }, // ply 4: judged elsewhere
    ]
    const advices = new Map<number, Advice>([
      [3 + 1, { ply: 4, color: 'white', judgment: 'blunder', mate: false }],
    ])
    const q = moveQualities(evals, advices, 1, (ply) => ply === 1)
    expect([...q.entries()]).toEqual([
      [0, 'book'],
      [1, 'best'],
      [2, 'excellent'],
      [3, 'good'],
    ])
  })
})

describe('classifyMove', () => {
  it('labels a single move from the evals around it', () => {
    expect(classifyMove({ cp: 30 }, { cp: 30 }, 'white', true)).toBe('best')
    expect(classifyMove({ cp: 30 }, { cp: 20 }, 'white', false)).toBe('excellent')
    expect(classifyMove({ cp: 30 }, { cp: -20 }, 'white', false)).toBe('good')
    expect(classifyMove({ cp: 30 }, { cp: 400 }, 'black', false)).toBe('blunder')
    // A blunder stays a blunder even if it was the engine's (shallow) first choice.
    expect(classifyMove({ cp: 0 }, { mate: 2 }, 'black', true)).toBe('blunder')
  })
})
