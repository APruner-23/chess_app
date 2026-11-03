import { describe, expect, it } from 'vitest'
import { classifyPuzzle } from '../../src/puzzles/motifs'

const even = { cp: 0 }
const base = { color: 'white' as const, evalBefore: even, evalAfter: { cp: -300 } }

describe('puzzle motifs', () => {
  it('finds a missed mate', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        solution: 'a1a8',
        played: 'Kf2',
      }),
    ).toBe('mateMissed')
    // A forced mate in the eval counts too, even if the solution is not mate yet.
    expect(
      classifyPuzzle({
        ...base,
        fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        solution: 'a1a7',
        played: 'Kf2',
        evalBefore: { mate: 3 },
      }),
    ).toBe('mateMissed')
  })

  it('finds an allowed mate', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: 'r5k1/8/8/8/8/8/5PPP/6K1 w - - 0 1',
        solution: 'h2h3',
        played: 'Kf1',
        evalAfter: { mate: -2 },
      }),
    ).toBe('mateAllowed')
  })

  it('finds a piece left hanging by the game move', () => {
    // Bc4 puts the bishop where the d5 pawn takes it.
    expect(
      classifyPuzzle({
        ...base,
        fen: '4k3/8/8/3p4/8/8/8/4KB2 w - - 0 1',
        solution: 'f1b5',
        played: 'Bc4',
      }),
    ).toBe('hanging')
  })

  it('finds a missed capture', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1',
        solution: 'd1d5',
        played: 'Ke2',
      }),
    ).toBe('missedCapture')
  })

  it('finds a fork', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
        solution: 'b5c7',
        played: 'Kd2',
      }),
    ).toBe('fork')
  })

  it('finds a pin', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1',
        solution: 'f1b5',
        played: 'Kd2',
      }),
    ).toBe('pin')
  })

  it('finds a promotion, and calls the rest positional', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '8/P7/8/8/8/8/k7/4K3 w - - 0 1',
        solution: 'a7a8q',
        played: 'Kd2',
      }),
    ).toBe('promotion')
    expect(
      classifyPuzzle({
        ...base,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        solution: 'e2e4',
        played: 'a3',
      }),
    ).toBe('other')
  })

  it('calls technique what happens in an endgame without a tactic', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
        solution: 'e1d2',
        played: 'e4',
        endgame: true,
      }),
    ).toBe('endgame')
  })

  it('does not count a recapture with the wrong piece as a missed capture', () => {
    // Black bishop on f3: the solution takes with the queen, the game took with the pawn.
    expect(
      classifyPuzzle({
        ...base,
        fen: '4k3/8/8/8/8/5b2/6P1/3QK3 w - - 0 1',
        solution: 'd1f3',
        played: 'gxf3',
      }),
    ).not.toBe('missedCapture')
  })

  it('does not take castling (king takes rook) for a capture', () => {
    expect(
      classifyPuzzle({
        ...base,
        fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
        solution: 'e1h1',
        played: 'Kd2',
      }),
    ).toBe('other')
  })
})
