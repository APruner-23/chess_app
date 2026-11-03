import { describe, expect, it } from 'vitest'
import { replaySan } from '../../src/chess/position'
import { BOT_LEVELS, gameEnd, pickBotMove } from '../../src/sparring/bot'
import type { PvLine } from '../../src/engine/uci'

const line = (uci: string, cp: number): PvLine => ({
  multipv: 1,
  depth: 10,
  eval: { cp },
  pv: [uci],
  nodes: 1,
})
// White to move: e2e4 is best, a2a3 loses ~4 win%, g2g4 throws the game away.
const lines = [line('e2e4', 40), line('a2a3', 0), line('g2g4', -500)]

describe('sparring bot', () => {
  it('always plays the best move at full strength', () => {
    const top = BOT_LEVELS[BOT_LEVELS.length - 1]!
    for (const r of [0, 0.5, 0.99]) expect(pickBotMove(lines, 'white', top, () => r)).toBe('e2e4')
  })

  it('reads evals from the side to move', () => {
    const top = BOT_LEVELS[BOT_LEVELS.length - 1]!
    // Black to move: the most negative eval (White's view) is Black's best.
    expect(pickBotMove(lines, 'black', top)).toBe('g2g4')
  })

  it('weaker levels sometimes pick worse moves, rarely the blunder', () => {
    const count = (level: number) => {
      const picks: Record<string, number> = {}
      for (let i = 0; i < 1000; i++) {
        const m = pickBotMove(lines, 'white', BOT_LEVELS[level]!, () => (i + 0.5) / 1000)!
        picks[m] = (picks[m] ?? 0) + 1
      }
      return picks
    }
    const weak = count(0)
    const strong = count(5)
    expect(weak['a2a3']!).toBeGreaterThan(200)
    expect(strong['a2a3'] ?? 0).toBeLessThan(weak['a2a3']!)
    expect(strong['e2e4']!).toBeGreaterThan(900)
    expect(weak['g2g4'] ?? 0).toBeLessThan(50)
  })
})

describe('game end', () => {
  it('detects checkmate and threefold repetition', () => {
    expect(gameEnd(replaySan(['f3', 'e5', 'g4', 'Qh4#']).fens)).toEqual({
      winner: 'black',
      reason: 'checkmate',
    })
    const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']
    const { fens } = replaySan(shuffle)
    expect(gameEnd(fens.slice(0, 8))).toBeUndefined()
    expect(gameEnd(fens)).toEqual({ reason: 'repetition' })
  })
})
