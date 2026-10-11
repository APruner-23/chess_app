import { describe, expect, it } from 'vitest'
import { replaySan } from '../../src/chess/position'
import { classify, openingFamily } from '../../src/openings/classify'
import { openingStats } from '../../src/openings/stats'
import openingsJson from '../../src/openings/openings.json'
import type { OpeningMap } from '../../src/openings/types'
import type { Game } from '../../src/import/types'
import { filterGames } from '../../src/import/filter'

const openings = openingsJson as OpeningMap
const classifyMoves = (sans: string[]) => classify(replaySan(sans).epds, openings)

describe('opening classification', () => {
  it('finds the deepest named position', () => {
    expect(classifyMoves(['e4', 'c5', 'Nf3', 'd6'])).toMatchObject({ eco: 'B50', ply: 4 })
  })

  it('keeps the last match after the game leaves theory', () => {
    const c = classifyMoves(['e4', 'c5', 'Nf3', 'd6', 'a3', 'h5', 'h3'])
    expect(c).toMatchObject({ eco: 'B50', ply: 4 })
  })

  it('recognizes transpositions', () => {
    const direct = classifyMoves(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'])
    const transposed = classifyMoves(['c4', 'e6', 'Nc3', 'Nf6', 'd4', 'Bb4'])
    expect(direct?.name).toMatch(/^Nimzo-Indian Defense/)
    expect(transposed?.name).toBe(direct?.name)
  })

  it('returns undefined when nothing matches', () => {
    expect(classify(replaySan([]).epds, openings)).toBeUndefined()
  })

  it('extracts the family name', () => {
    expect(openingFamily('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense')
    expect(openingFamily('Scandinavian Defense')).toBe('Scandinavian Defense')
  })
})

describe('opening stats', () => {
  const g = (openingName: string | undefined, result: Game['result'], eco = 'B00') =>
    ({ openingName, result, eco }) as Game

  it('counts W/D/L and score by family or variation', () => {
    const games = [
      g('Sicilian Defense: Najdorf Variation', 'win', 'B90'),
      g('Sicilian Defense: Najdorf Variation', 'loss', 'B90'),
      g('Sicilian Defense: Dragon Variation', 'draw', 'B70'),
      g(undefined, 'win'),
    ]
    const family = openingStats(games, 'family')
    expect(family[0]).toMatchObject({
      name: 'Sicilian Defense',
      eco: 'B90',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      score: 50,
    })
    expect(family[1]).toMatchObject({ name: 'Sconosciuta', games: 1, score: 100 })
    expect(openingStats(games, 'variation').map((s) => s.games)).toEqual([2, 1, 1])
  })
})

describe('game filter', () => {
  const games = [
    {
      site: 'lichess',
      userColor: 'white',
      speed: 'blitz',
      result: 'win',
      openingName: 'Sicilian Defense: Najdorf Variation',
      eco: 'B90',
    },
    {
      site: 'chesscom',
      userColor: 'black',
      speed: 'rapid',
      result: 'loss',
      openingName: 'Caro-Kann Defense',
      eco: 'B10',
    },
    { site: 'chesscom', userColor: 'white', speed: 'blitz', result: 'draw' },
  ] as Game[]

  it('combines filters', () => {
    expect(filterGames(games, { site: 'chesscom' })).toHaveLength(2)
    expect(filterGames(games, { color: 'white', speed: 'blitz' })).toHaveLength(2)
    expect(filterGames(games, { result: 'loss' })[0]!.eco).toBe('B10')
  })

  it('matches openings by family, ECO, substring or unknown', () => {
    expect(filterGames(games, { opening: 'Sicilian Defense' })).toHaveLength(1)
    expect(filterGames(games, { opening: 'najdorf' })).toHaveLength(1)
    expect(filterGames(games, { opening: 'b10' })).toHaveLength(1)
    expect(filterGames(games, { opening: 'Sconosciuta' })).toHaveLength(1)
  })
})
