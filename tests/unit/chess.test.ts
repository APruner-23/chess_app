import { describe, expect, it } from 'vitest'
import { INITIAL_EPD, replaySan } from '../../src/chess/position'
import { figurine } from '../../src/chess/figurine'

describe('normalized EPD', () => {
  it('starts from the standard position', () => {
    expect(INITIAL_EPD).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
  })

  it('drops the en-passant square when no capture is possible', () => {
    const { epds } = replaySan(['e4'])
    expect(epds[1]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')
  })

  it('keeps the en-passant square when the capture is legal', () => {
    const { epds } = replaySan(['e4', 'a6', 'e5', 'd5'])
    expect(epds[4]).toMatch(/ w KQkq d6$/)
  })

  it('merges transpositions', () => {
    const a = replaySan(['e4', 'e5', 'Nf3', 'Nc6']).epds[4]
    const b = replaySan(['Nf3', 'Nc6', 'e4', 'e5']).epds[4]
    expect(a).toBe(b)
  })

  it('returns UCI moves and rejects illegal SAN', () => {
    expect(replaySan(['e4', 'e5', 'Nf3']).ucis).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(() => replaySan(['e4', 'e4'])).toThrow(/Illegal move e4 at ply 2/)
  })
})

describe('figurine SAN', () => {
  it('replaces piece letters only', () => {
    expect(figurine('Nf3')).toBe('♘f3')
    expect(figurine('exd8=Q+')).toBe('exd8=♕+')
    expect(figurine('O-O')).toBe('O-O')
    expect(figurine('Bxb5')).toBe('♗xb5')
  })
})
