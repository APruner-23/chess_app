import { describe, expect, it } from 'vitest'
import { INITIAL_EPD } from '../../src/chess/position'
import { RepGraph, makeRepMove } from '../../src/repertoire/graph'
import type { RepMove, Repertoire } from '../../src/repertoire/types'
import { compareGame, groupKey } from '../../src/feedback/compareGame'
import { judgeMoves } from '../../src/analysis/judgments'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { ndjsonLines } from '../helpers'

const raw = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson').find(
  (g) => g.id === 'cr7uqgee',
)!
const { game, analysis } = normalizeLichess(raw, 'MalVoluto')!
const color = game.userColor
const rep: Repertoire = {
  id: 'r',
  name: 'R',
  color,
  experimental: false,
  createdAt: 0,
  updatedAt: 0,
}

function repOf(sans: string[]): RepGraph {
  const moves: RepMove[] = []
  let epd = INITIAL_EPD
  for (const san of sans) {
    const m = makeRepMove('r', epd, san, 0)!
    moves.push(m)
    epd = m.toEpd
  }
  return new RepGraph(moves)
}
const userPly = color === 'white' ? 0 : 1 // first ply where the user moves
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind).sort()

describe('compareGame', () => {
  it('flags a deviation when the user leaves the repertoire', () => {
    const at = userPly + 2
    const other =
      game.moves[at] === 'a3' || game.moves[at] === 'a6' ? 'h3' : color === 'white' ? 'a3' : 'a6'
    const graph = repOf([...game.moves.slice(0, at), other])
    const items = compareGame(game, [{ repertoire: rep, graph }])
    const dev = items.find((i) => i.kind === 'deviation')!
    expect(dev).toMatchObject({ ply: at, san: game.moves[at], expectedSan: other, bookPlies: at })
    expect(dev.path).toEqual(game.moves.slice(0, at))
    expect(items.find((i) => i.kind === 'exit')!.status).toBe('info')
  })

  it('flags a hole when the opponent plays an unprepared move', () => {
    const at = userPly + 1
    const other =
      game.moves[at] === 'h3' || game.moves[at] === 'h6' ? 'a3' : at % 2 === 0 ? 'h3' : 'h6'
    const graph = repOf([...game.moves.slice(0, at), other])
    expect(
      compareGame(game, [{ repertoire: rep, graph }]).find((i) => i.kind === 'hole'),
    ).toMatchObject({
      ply: at,
      san: game.moves[at],
    })
  })

  it('proposes the engine move for a mistake soon after the book ends', () => {
    const evals = analysis!.plies.map((p) => p.eval)
    const mistake = judgeMoves(evals, (p) => analysis!.plies[p]!.best !== undefined).find(
      (a) => a.color === color && a.judgment !== 'inaccuracy',
    )!
    const bookEnd = Math.max(0, mistake.ply - 4)
    const items = compareGame(
      game,
      [{ repertoire: rep, graph: repOf(game.moves.slice(0, bookEnd)) }],
      analysis,
    )
    const extend = items.find((i) => i.kind === 'extend')!
    expect(extend.ply).toBe(mistake.ply)
    expect(extend.bestSan).toBeTruthy()
    expect(extend.path).toEqual(game.moves.slice(0, mistake.ply))
    expect(items.find((i) => i.kind === 'exit')!.exitEval).toEqual(evals[bookEnd - 1])
  })

  it('keeps only statistics for games played before the repertoire existed', () => {
    const graph = repOf([...game.moves.slice(0, userPly + 2), color === 'white' ? 'a3' : 'a6'])
    const late = { ...rep, createdAt: game.playedAt + 1 }
    expect(kinds(compareGame(game, [{ repertoire: late, graph }]))).toEqual(['exit'])
  })

  it('picks the repertoire followed the longest and ignores the other color', () => {
    const short = { repertoire: { ...rep, id: 's' }, graph: repOf(game.moves.slice(0, 2)) }
    const long = { repertoire: rep, graph: repOf(game.moves.slice(0, 6)) }
    const other = {
      repertoire: { ...rep, id: 'o', color: color === 'white' ? 'black' : 'white' } as Repertoire,
      graph: repOf(game.moves.slice(0, 10)),
    }
    const exit = compareGame(game, [short, long, other]).find((i) => i.kind === 'exit')!
    expect(exit).toMatchObject({ repertoireId: 'r', bookPlies: 6 })
    expect(groupKey(exit)).toBe(`r|${exit.epd}|exit|${game.moves[6]}`)
  })
})

describe('dashboard stats', () => {
  it('aggregates lines, experimental vs main, ratings and accuracy', async () => {
    const { lineStats, experimentalVsMain, ratingSeries, userAccuracy, userPawns } =
      await import('../../src/feedback/stats')
    const exit = (id: string, repertoireId: string, result: 'win' | 'loss', cp?: number) =>
      ({
        id,
        gameId: id,
        repertoireId,
        kind: 'exit',
        result,
        bookPlies: 8,
        ...(cp !== undefined ? { exitEval: { cp } } : {}),
      }) as never
    const reps = new Map([
      ['w', { ...rep, id: 'w', color: 'white' as const, experimental: false }],
      ['x', { ...rep, id: 'x', color: 'black' as const, experimental: true }],
    ])
    const games = new Map([
      ['a', { ...game, openingName: 'Italian Game' }],
      ['b', { ...game, openingName: 'Italian Game' }],
      ['c', { ...game, openingName: 'Sicilian Defense' }],
    ])
    const outOfBook = { ...(exit('d', 'w', 'win') as object), bookPlies: 0 } as never
    const exits = [
      exit('a', 'w', 'win', 50),
      exit('b', 'w', 'loss'),
      exit('c', 'x', 'win', 100),
      outOfBook,
    ]
    const lines = lineStats(exits, games, reps)
    expect(lines[0]).toMatchObject({
      name: 'Italian Game',
      games: 2,
      score: 50,
      avgExit: 0.5,
      avgBookMoves: 4,
    })
    const vs = experimentalVsMain(exits, reps)
    expect(vs.experimental).toMatchObject({ games: 1, avgExit: -1 })
    expect(vs.main.games).toBe(2)
    expect(userPawns({ mate: 2 }, 'black')).toBe(-10)
    expect(ratingSeries([game], game.site, game.speed)).toEqual([
      { t: game.playedAt, rating: game[color].rating },
    ])
    expect(userAccuracy(game, analysis!)).toBe(raw.players[color].analysis!.accuracy)
  })
})
