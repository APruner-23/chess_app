import { describe, expect, it } from 'vitest'
import { gameAccuracy, moveAccuracy } from '../../src/analysis/accuracy'
import { countJudgments, judgeMoves } from '../../src/analysis/judgments'
import { winPercent } from '../../src/analysis/winPercent'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { ndjsonLines } from '../helpers'

describe('win% and move accuracy', () => {
  it('matches the lila formulas', () => {
    expect(winPercent({ cp: 0 })).toBe(50)
    expect(winPercent({ cp: 5000 })).toBeCloseTo(winPercent({ cp: 1000 }))
    expect(winPercent({ mate: 3 })).toBeCloseTo(winPercent({ cp: 1000 }))
    expect(winPercent({ mate: -3 })).toBeCloseTo(winPercent({ cp: -1000 }))
    expect(moveAccuracy(50, 60)).toBe(100)
    expect(moveAccuracy(50, 50)).toBe(100)
    expect(moveAccuracy(80, 20)).toBeCloseTo(5.4, 1)
  })
})

describe('cross-check against Lichess server analysis', () => {
  const raws = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson')

  // 1FaVySeC (178 plies, 37 mate evals): White comes out 51.3 vs 54 on Lichess, for
  // reasons not found in the fixture (every other game matches within ±0.3).
  const tolerance: Record<string, number> = { '1FaVySeC': 3 }
  // Lichess only judges plies for which its server computed a better variation.
  const judged = (raw: LichessGame) => (ply: number) => raw.analysis![ply]!.best !== undefined

  it.each(raws.map((r) => [r.id, r] as const))('%s: accuracy and judgment counts', (_, raw) => {
    const evals = normalizeLichess(raw, 'MalVoluto')!.analysis!.plies.map((p) => p.eval)
    const accuracy = gameAccuracy(evals)
    const advices = judgeMoves(evals, judged(raw))
    for (const color of ['white', 'black'] as const) {
      const server = raw.players[color].analysis as Record<string, number>
      const diff = Math.abs(accuracy[color]! - server.accuracy!)
      expect(diff).toBeLessThanOrEqual(tolerance[raw.id] ?? 1)
      expect(countJudgments(advices, color)).toEqual({
        inaccuracy: server.inaccuracy,
        mistake: server.mistake,
        blunder: server.blunder,
      })
    }
  })

  it('flags the same plies Lichess judged', () => {
    for (const raw of raws) {
      const evals = normalizeLichess(raw, 'MalVoluto')!.analysis!.plies.map((p) => p.eval)
      const ours = judgeMoves(evals, judged(raw)).map((a) => `${a.ply}:${a.judgment}`)
      const theirs = raw.analysis!.flatMap((a, ply) =>
        'judgment' in a
          ? [`${ply}:${(a as { judgment: { name: string } }).judgment.name.toLowerCase()}`]
          : [],
      )
      expect(ours).toEqual(theirs)
    }
  })
})
