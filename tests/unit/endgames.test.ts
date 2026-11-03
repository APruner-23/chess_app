import { describe, expect, it } from 'vitest'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { ENDGAMES } from '../../src/endgames/catalog'
import { judgeEndgame } from '../../src/endgames/judge'
import { pickBookMove } from '../../src/sparring/bot'

describe('endgame catalog', () => {
  it('has legal, unique positions', () => {
    expect(new Set(ENDGAMES.map((e) => e.id)).size).toBe(ENDGAMES.length)
    for (const e of ENDGAMES) {
      const pos = Chess.fromSetup(parseFen(e.fen).unwrap())
      expect(pos.isOk, e.id).toBe(true)
      expect(pos.unwrap().isEnd(), e.id).toBe(false)
    }
  })
})

describe('endgame verdicts', () => {
  const base = { color: 'white' as const, promoted: false, userMoves: 3 }
  it('mate goals need a checkmate and fail when the win slips', () => {
    expect(
      judgeEndgame({ ...base, goal: 'mate', end: { winner: 'white', reason: 'checkmate' } }),
    ).toMatchObject({ ok: true })
    expect(judgeEndgame({ ...base, goal: 'mate', end: { reason: 'stalemate' } })).toMatchObject({
      ok: false,
    })
    expect(judgeEndgame({ ...base, goal: 'mate', evaluation: { mate: 7 } })).toBeUndefined()
    expect(judgeEndgame({ ...base, goal: 'mate', evaluation: { cp: 50 } })).toMatchObject({
      ok: false,
    })
  })

  it('promote goals count once the pawn has queened and the user stays winning', () => {
    expect(judgeEndgame({ ...base, goal: 'promote', evaluation: { cp: 700 } })).toBeUndefined()
    expect(
      judgeEndgame({ ...base, goal: 'promote', promoted: true, evaluation: { cp: 900 } }),
    ).toMatchObject({ ok: true })
  })

  it('draw goals succeed after holding long enough or on a draw, from Black too', () => {
    const black = { ...base, color: 'black' as const, goal: 'draw' as const }
    expect(judgeEndgame({ ...black, evaluation: { cp: 0 } })).toBeUndefined()
    expect(judgeEndgame({ ...black, evaluation: { cp: 0 }, userMoves: 15 })).toMatchObject({
      ok: true,
    })
    expect(judgeEndgame({ ...black, end: { reason: 'repetition' } })).toMatchObject({ ok: true })
    // +6 for White is lost for Black.
    expect(judgeEndgame({ ...black, evaluation: { cp: 600 } })).toMatchObject({ ok: false })
  })
})

describe('realistic opponent', () => {
  const m = (uci: string, games: number) => ({ uci, san: uci, white: games, draws: 0, black: 0 })
  it('plays moves as often as players of the level do, ignoring rare ones', () => {
    const moves = [m('e7e5', 60), m('c7c5', 39), m('g7g5', 1)]
    const picks: Record<string, number> = {}
    for (let i = 0; i < 100; i++) {
      const p = pickBookMove(moves, () => (i + 0.5) / 100)!
      picks[p.uci] = (picks[p.uci] ?? 0) + 1
    }
    expect(picks['e7e5']).toBeGreaterThan(55)
    expect(picks['c7c5']).toBeGreaterThan(35)
    expect(picks['g7g5']).toBeUndefined()
    expect(pickBookMove(moves, () => 0)!.share).toBeCloseTo(0.6)
  })

  it('leaves rare positions to the engine', () => {
    expect(pickBookMove([m('e7e5', 10), m('c7c5', 5)])).toBeUndefined()
  })
})

describe('endgame sessions', () => {
  it('serves due exercises first, then a few new ones a day, in catalog order', async () => {
    const { endgamesToday, endgameStatus } = await import('../../src/endgames/session')
    const { schedule, Rating } = await import('../../src/training/fsrs')
    const { ENDGAMES } = await import('../../src/endgames/catalog')
    const NOW = new Date(2026, 10, 3, 12).getTime()
    const prog = (id: string, due: number, introducedAt: number) => ({
      id,
      fsrs: { ...schedule(undefined, Rating.Good, 0), due },
      attempts: 1,
      solved: 1,
      lastCorrect: true,
      introducedAt,
      updatedAt: 0,
    })
    const third = ENDGAMES[2]!.id
    const progress = new Map([
      [ENDGAMES[0]!.id, prog(ENDGAMES[0]!.id, NOW + 86_400_000, 0)],
      [third, prog(third, NOW - 1, NOW - 1000)], // due, introduced today
    ])
    const today = endgamesToday(progress, NOW).map((e) => e.id)
    // One new allowed today (2 per day, one already introduced): the first never tried.
    expect(today).toEqual([third, ENDGAMES[1]!.id])
    expect(endgameStatus(ENDGAMES[0]!.id, progress, NOW).kind).toBe('scheduled')
    expect(endgameStatus(ENDGAMES[3]!.id, progress, NOW).kind).toBe('new')
  })
})
