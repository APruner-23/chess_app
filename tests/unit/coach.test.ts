import { describe, expect, it } from 'vitest'
import { coachReport, impact } from '../../src/coach/insights'
import type { Game, GameResult } from '../../src/import/types'

const NOW = new Date(2026, 10, 3, 12).getTime()
const HOUR = 3_600_000
let n = 0
function game(over: Partial<Game> & { result: GameResult }): Game {
  n++
  return {
    id: `g${n}`,
    site: 'chesscom',
    url: '',
    // Three hours apart: every game starts a new session unless set otherwise.
    playedAt: NOW - n * 3 * HOUR,
    speed: 'blitz',
    timeControl: '180+2',
    rated: true,
    userColor: 'white',
    termination: over.result === 'loss' ? 'resigned' : 'resigned',
    white: { name: 'me', rating: 800 },
    black: { name: 'opp', rating: 800 },
    moves: ['e4', 'e5'],
    updatedAt: 0,
    ...over,
  }
}
const input = (games: Game[]) => ({
  games,
  analyses: new Map(),
  puzzles: [],
  exits: [],
  reps: new Map(),
  openFeedback: 0,
  now: NOW,
})

describe('coach', () => {
  it('flags a weak opening, praises a strong one, and ranks by cost', () => {
    const games = [
      ...Array.from({ length: 20 }, (_, i) =>
        game({ result: i < 4 ? 'win' : 'loss', openingName: 'French Defense: Advance' }),
      ),
      ...Array.from({ length: 40 }, (_, i) =>
        game({ result: i < 32 ? 'win' : 'loss', openingName: 'Italian Game' }),
      ),
    ]
    const r = coachReport(input(games))
    expect(r.games).toBe(60)
    const french = r.weaknesses.find((w) => w.id === 'opening-white-French Defense')
    expect(french?.title).toContain('20%')
    expect(french?.action?.to).toBe('/repertori')
    expect(r.strengths.map((s) => s.id)).toContain('opening-white-Italian Game')
    const costs = r.weaknesses.map((w) => w.cost)
    expect(costs).toEqual([...costs].sort((a, b) => b - a))
  })

  it('flags losses on time per cadence', () => {
    const games = Array.from({ length: 40 }, (_, i) =>
      game({
        result: i < 20 ? 'win' : 'loss',
        termination: i >= 30 ? 'timeout' : 'resigned',
        clocks: [17_800, 17_800, 17_000, 16_000],
        moves: ['e4', 'e5', 'Nf3', 'Nc6'],
      }),
    )
    const w = coachReport(input(games)).weaknesses.find((x) => x.id === 'time-losses-blitz')
    expect(w?.title).toBe('In blitz perdi per tempo il 50% delle sconfitte')
    expect(w?.action?.to).toBe('/statistiche?speed=blitz')
  })

  it('notices tilt after a loss', () => {
    // Pairs inside a session: a first game won, then a loss followed by another loss.
    const games: Game[] = []
    for (let i = 0; i < 20; i++) {
      const t = NOW - i * 24 * HOUR
      games.push(game({ result: 'win', playedAt: t }))
      games.push(game({ result: 'loss', playedAt: t + 10 * 60_000 }))
      games.push(game({ result: 'loss', playedAt: t + 20 * 60_000 }))
    }
    const tilt = coachReport(input(games)).weaknesses.find((w) => w.id === 'tilt')
    expect(tilt?.title).toBe('Dopo una sconfitta il tuo punteggio scende al 0%')
    expect(impact(tilt!.cost)).toBe('alto')
  })

  it('shares the points lost to errors among motifs, leaving out "positional"', () => {
    const games = Array.from({ length: 60 }, (_, i) => game({ result: i % 2 ? 'win' : 'loss' }))
    const analyses = new Map(
      games
        .slice(0, 20)
        .map((g) => [g.id, { id: g.id, source: 'local' as const, plies: [], updatedAt: 0 }]),
    )
    const puzzle = (gameId: string, motif: string, judgment: 'mistake' | 'blunder') =>
      ({ id: `${gameId}|${motif}`, gameId, motif, judgment }) as never
    const puzzles = [
      ...Array.from({ length: 10 }, (_, i) => puzzle(games[i]!.id, 'other', 'mistake')),
      ...Array.from({ length: 6 }, (_, i) => puzzle(games[i]!.id, 'hanging', 'blunder')),
      ...Array.from({ length: 4 }, (_, i) => puzzle(games[i]!.id, 'fork', 'mistake')),
    ]
    const r = coachReport({ ...input(games), analyses, puzzles })
    const motifs = r.weaknesses.filter((w) => w.id.startsWith('motif-'))
    expect(motifs.map((w) => w.id)).toEqual(['motif-hanging', 'motif-fork'])
    // Score 50%: 50 points lost per 100 games, half of them put down to errors.
    const budget = 25
    expect(motifs.reduce((a, w) => a + w.cost, 0)).toBeLessThanOrEqual(budget)
    expect(motifs[0]!.cost).toBeCloseTo(budget * (12 / 26))
  })

  it('stays quiet without games', () => {
    expect(coachReport(input([]))).toEqual({ games: 0, analyzed: 0, weaknesses: [], strengths: [] })
  })
})
