import { describe, expect, it } from 'vitest'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { normalizeChesscom, type ChesscomGame } from '../../src/import/chesscom'
import type { Analysis, Game } from '../../src/import/types'
import {
  endings,
  filterGames,
  ratingChange,
  scoreAfterResult,
  scoreByDayPart,
  scoreByRatingGap,
  scoreOf,
} from '../../src/stats/games'
import { factsMap } from '../../src/analysis/facts'
import { errorsByPhase, parseTimeControl, plyTimes, timeStats } from '../../src/stats/time'
import { fixtureJson, ndjsonLines } from '../helpers'

const lichess = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson').map((g) =>
  normalizeLichess(g, 'MalVoluto')!,
)
const chesscom = fixtureJson<{ games: ChesscomGame[] }>('chesscom/alepruner-2026-09.json')
  .games.map((g) => normalizeChesscom(g, 'AlePruner'))
  .filter((g) => g !== undefined)
  .map((g) => g.game)
const analyses = new Map<string, Analysis>(lichess.map((g) => [g.game.id, g.analysis!]))
const all0 = [...lichess.map((g) => g.game)]
const facts = factsMap(all0, analyses)
const all: Game[] = [...lichess.map((g) => g.game), ...chesscom]

describe('game stats', () => {
  it('scores results', () => {
    expect(scoreOf(['win', 'draw', 'loss', 'loss'])).toEqual({
      games: 4,
      wins: 1,
      draws: 1,
      losses: 2,
      score: 0.375,
    })
    expect(scoreOf([]).score).toBeUndefined()
  })

  it('filters by speed and period', () => {
    const now = Math.max(...all.map((g) => g.playedAt))
    const blitz = filterGames(all, { speed: 'blitz' }, now)
    expect(blitz.length).toBeGreaterThan(0)
    expect(blitz.every((g) => g.speed === 'blitz')).toBe(true)
    expect(filterGames(all, { months: 1 }, now).length).toBeLessThan(all.length)
  })

  it('groups how games ended, rating gaps, day parts, sessions and openings', () => {
    const ends = endings(chesscom)
    const decisive = chesscom.filter((g) => g.result !== 'draw').length
    expect(ends.reduce((n, e) => n + e.wins + e.losses, 0)).toBe(decisive)
    expect(ends.map((e) => e.kind)).toContain('time')

    const gaps = scoreByRatingGap(chesscom)
    expect(gaps.reduce((n, g) => n + g.s.games, 0)).toBe(chesscom.length)
    expect(gaps.map((g) => g.gap)).toEqual([...gaps.map((g) => g.gap)].sort((a, b) => a - b))

    expect(scoreByDayPart(chesscom).reduce((n, p) => n + p.s.games, 0)).toBe(chesscom.length)
    const tilt = scoreAfterResult(chesscom)
    expect(tilt.first.games + tilt.win.games + tilt.draw.games + tilt.loss.games).toBe(
      chesscom.length,
    )
  })
})

describe('rating change', () => {
  it('compares the latest rating with the one before the window', () => {
    const day = 86_400_000
    const s = [
      { t: 0, rating: 1000 },
      { t: 10 * day, rating: 1050 },
      { t: 50 * day, rating: 1100 },
      { t: 55 * day, rating: 1080 },
    ]
    expect(ratingChange(s, 60 * day)).toBe(30)
    expect(ratingChange(s, 20 * day)).toBe(80) // nothing before the window: from the first point
    expect(ratingChange(s.slice(0, 1), 60 * day)).toBeUndefined()
  })
})

describe('time stats', () => {
  it('parses time controls and move times', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 })
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 })
    expect(parseTimeControl('-')).toBeUndefined()
    const g = chesscom.find((x) => x.clocks)!
    const t = plyTimes(g)!
    expect(t.plies).toHaveLength(g.clocks!.length)
    expect(t.plies.every((p) => p.spent >= 0 && p.before <= t.base + 1000)).toBe(true)
  })

  it('compares the user with the opponents and links time to errors', () => {
    const s = timeStats(all, facts)
    expect(s.games).toBeGreaterThan(50)
    expect(s.perMove[0]!.user).toBeGreaterThan(0)
    expect(s.clockLeft[0]!.user).toBeGreaterThan(0)
    expect(s.clockLeft[0]!.user).toBeLessThanOrEqual(1.5)
    expect(s.lostOnTime).toBeLessThanOrEqual(s.losses)
    const analyzedMoves = s.errorsByThink.reduce((n, b) => n + b.moves, 0)
    expect(analyzedMoves).toBeGreaterThan(0)
    expect(s.lowClock.low.games + s.lowClock.ok.games).toBe(s.games)
  })

  it('counts errors by phase in analyzed games', () => {
    const ph = errorsByPhase(all, facts)
    expect(ph.map((p) => p.phase)).toEqual(['opening', 'middlegame', 'endgame'])
    expect(ph.reduce((n, p) => n + p.moves, 0)).toBeGreaterThan(50)
  })
})

describe('progress by month', () => {
  it('groups games by month with score, analyzed accuracy and trends', async () => {
    const { monthlyProgress, trend } = await import('../../src/stats/progress')
    const rows = monthlyProgress(all, facts, [])
    expect(rows.reduce((n, r) => n + r.games, 0)).toBe(all.length)
    expect(rows.map((r) => r.month)).toEqual([...rows.map((r) => r.month)].sort())
    const lichessMonth = rows.find((r) => r.month === '2025-12')!
    expect(lichessMonth.accuracy).toBeGreaterThan(40)
    expect(lichessMonth.errorsPer100).toBeGreaterThan(0)
    const sept = rows.find((r) => r.month === '2026-09')!
    expect(sept.accuracy).toBeUndefined()
    expect(sept.timeLosses).toBeGreaterThan(0)

    const fake = [1, 2, 3, 4, 5, 6].map((i) => ({
      month: `2026-0${i}`,
      label: '',
      games: 10,
      score: i <= 3 ? 0.4 : 0.6,
      timeLosses: 0,
      inBook: 0,
    }))
    expect(trend(fake, 'score')).toEqual({ recent: 0.6, before: 0.4 })
    expect(trend(fake.slice(0, 2), 'score')).toBeUndefined()
  })
})
