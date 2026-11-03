import { describe, expect, it } from 'vitest'
import { draftFromGames, draftLines, draftSize } from '../../src/repertoire/fromGames'
import type { Game, GameResult } from '../../src/import/types'

let n = 0
const g = (moves: string, result: GameResult, userColor: 'white' | 'black' = 'white') =>
  ({ id: `g${n++}`, userColor, result, moves: moves.split(' ') }) as Game

describe('repertoire from games', () => {
  const games = [
    ...Array.from({ length: 6 }, () => g('e4 e5 Nf3 Nc6', 'win')),
    ...Array.from({ length: 5 }, () => g('e4 c5 Nf3 d6', 'loss')),
    ...Array.from({ length: 4 }, () => g('e4 c5 Nc3 Nc6', 'loss')),
    ...Array.from({ length: 2 }, () => g('d4 d5', 'win')),
    ...Array.from({ length: 3 }, () => g('e4 e6 d4 d5', 'draw')),
    g('e4 e5', 'win', 'black'),
  ]

  it('keeps the most played own move and every frequent reply', () => {
    const draft = draftFromGames(games, 'white', { maxPlies: 4, minGames: 3 })
    expect(draft.map((d) => d.san)).toEqual(['e4'])
    const e4 = draft[0]!
    expect(e4.games).toBe(18)
    expect(e4.children.map((c) => c.san)).toEqual(['c5', 'e5', 'e6'])
    // After 1…c5 the user played Nf3 more often than Nc3: only Nf3 is kept.
    expect(e4.children[0]!.children.map((c) => c.san)).toEqual(['Nf3'])
    expect(draftLines(draft)).toEqual([
      ['e4', 'c5', 'Nf3', 'd6'],
      ['e4', 'e5', 'Nf3', 'Nc6'],
      ['e4', 'e6', 'd4', 'd5'],
    ])
    expect(draftSize(draft)).toBe(10)
  })

  it('flags own moves that score poorly over enough games', () => {
    const draft = draftFromGames(games, 'white', { maxPlies: 4, minGames: 3 })
    const c5 = draft[0]!.children[0]!
    expect(c5.children[0]!.weak).toBe(false) // 5 games: too few to judge
    const more = [...games, ...Array.from({ length: 4 }, () => g('e4 c5 Nf3 d6', 'loss'))]
    const nf3 = draftFromGames(more, 'white', { maxPlies: 4, minGames: 3 })[0]!.children[0]!
      .children[0]!
    expect(nf3.san).toBe('Nf3')
    expect(nf3.weak).toBe(true)
  })
})
