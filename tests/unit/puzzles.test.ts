import { describe, expect, it } from 'vitest'
import { parseFen } from 'chessops/fen'
import { Chess } from 'chessops/chess'
import { parseUci } from 'chessops'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { judgeMoves } from '../../src/analysis/judgments'
import { MIN_WIN_BEFORE, extractPuzzles, winFor } from '../../src/puzzles/extract'
import { practicePuzzles, puzzleStats, scheduledPuzzles } from '../../src/puzzles/session'
import type { Puzzle, PuzzleProgress } from '../../src/puzzles/types'
import { schedule, Rating } from '../../src/training/fsrs'
import { ndjsonLines } from '../helpers'

const games = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson').map((g) =>
  normalizeLichess(g, 'MalVoluto')!,
)
const all = games.flatMap(({ game, analysis }) => extractPuzzles(game, analysis!))
const NOW = new Date(2026, 10, 3, 10).getTime()

describe('puzzle extraction', () => {
  it("turns the user's mistakes and blunders into puzzles with a legal better move", () => {
    expect(all.length).toBeGreaterThan(3)
    for (const p of all) {
      const { game } = games.find((g) => g.game.id === p.gameId)!
      expect(p.color).toBe(game.userColor)
      expect(['mistake', 'blunder']).toContain(p.judgment)
      expect(p.played).toBe(game.moves[p.ply])
      expect(p.solutionSan).not.toBe(p.played)
      const pos = Chess.fromSetup(parseFen(p.fen).unwrap()).unwrap()
      expect(pos.turn).toBe(p.color)
      expect(pos.isLegal(parseUci(p.solution)!)).toBe(true)
      expect(winFor(p.evalBefore, p.color)).toBeGreaterThanOrEqual(MIN_WIN_BEFORE)
    }
  })

  it("skips the opponent's errors and positions that were already lost", () => {
    const { game, analysis } = games[0]!
    const evals = analysis!.plies.map((p) => p.eval)
    const judged = (p: number) => analysis!.plies[p]!.best !== undefined
    const userErrors = judgeMoves(evals, judged).filter(
      (a) => a.color === game.userColor && a.judgment !== 'inaccuracy',
    )
    expect(extractPuzzles(game, analysis!).length).toBeLessThanOrEqual(userErrors.length)
    // As the other player, only the other side's moves (other ply parity) are puzzles.
    const flipped = { ...game, userColor: game.userColor === 'white' ? 'black' : 'white' } as const
    const parity = game.userColor === 'white' ? 0 : 1
    expect(extractPuzzles(game, analysis!).every((p) => p.ply % 2 === parity)).toBe(true)
    expect(extractPuzzles(flipped, analysis!).every((p) => p.ply % 2 !== parity)).toBe(true)
  })
})

describe('puzzle sessions', () => {
  const ps: Puzzle[] = [
    { ...all[0]!, id: 'a', judgment: 'mistake', playedAt: 3 },
    { ...all[0]!, id: 'b', judgment: 'blunder', playedAt: 1 },
    { ...all[0]!, id: 'c', judgment: 'mistake', playedAt: 2, phase: 'endgame' },
    { ...all[0]!, id: 'd', judgment: 'mistake', playedAt: 4 },
  ]
  const prog = (id: string, due: number, introducedAt = 0): PuzzleProgress => ({
    id,
    fsrs: { ...schedule(undefined, Rating.Good, 0), due },
    attempts: 1,
    solved: 1,
    lastCorrect: id !== 'd',
    introducedAt,
    updatedAt: 0,
  })

  it('serves due puzzles first, then new ones within the daily limit, blunders first', () => {
    const progress = new Map([['d', prog('d', NOW - 1, NOW - 1000)]])
    const s = scheduledPuzzles(ps, progress, NOW, 3)
    expect(s.map((p) => p.id)).toEqual(['d', 'b', 'a'])
    const st = puzzleStats(ps, progress, NOW, 3)
    expect(st).toMatchObject({ total: 4, due: 1, fresh: 3, newToday: 2, solvedShare: 0 })
  })

  it('filters free practice by phase', () => {
    expect(practicePuzzles(ps, { phase: 'endgame' }).map((p) => p.id)).toEqual(['c'])
    expect(practicePuzzles(ps, {}, () => 0)).toHaveLength(4)
  })
})
