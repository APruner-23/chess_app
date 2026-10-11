import { describe, expect, it } from 'vitest'
import { normalizeLichess, readNdjson, type LichessGame } from '../../src/import/lichess'
import { normalizeChesscom, type ChesscomGame } from '../../src/import/chesscom'
import { replaySan } from '../../src/chess/position'
import { fixtureJson, fixtureText, ndjsonLines } from '../helpers'

const recent = ndjsonLines<LichessGame>('lichess/malvoluto-recent.ndjson')
const analysed = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson')
const chesscom = fixtureJson<{ games: ChesscomGame[] }>('chesscom/alepruner-2026-09.json').games

describe('Lichess normalization', () => {
  const games = recent.map((g) => normalizeLichess(g, 'MalVoluto'))

  it('keeps every finished standard game of the user, with legal moves', () => {
    expect(games.every(Boolean)).toBe(true)
    for (const item of games) expect(() => replaySan(item!.game.moves)).not.toThrow()
  })

  it('maps color, result, speed and clocks', () => {
    const { game } = games[0]!
    expect(game).toMatchObject({
      id: 'lichess:YA9N5kBk',
      site: 'lichess',
      userColor: 'black',
      result: 'win',
      speed: 'bullet',
      timeControl: '120+1',
      termination: 'resign',
      white: { name: 'LeksLetov', rating: 1165 },
    })
    expect(game.url).toBe('https://lichess.org/YA9N5kBk/black')
    expect(game.clocks).toHaveLength(game.moves.length)
  })

  it('carries over server analysis from White’s point of view', () => {
    expect(games.filter((g) => g!.analysis).length).toBe(4)
    const { game, analysis } = normalizeLichess(analysed[0]!, 'MalVoluto')!
    expect(analysis!.plies).toHaveLength(game.moves.length)
    expect(analysis!.plies[0]).toEqual({ eval: { cp: 18 } })
    expect(analysis!.plies[2]).toEqual({ eval: { cp: -28 }, best: 'd2d4' })
    expect(analysis!.accuracy?.white).toBe(97)
  })

  it('skips variants, custom positions, aborted games and other users', () => {
    const base = recent[0]!
    expect(normalizeLichess({ ...base, variant: 'chess960' }, 'MalVoluto')).toBeUndefined()
    expect(normalizeLichess({ ...base, initialFen: 'x' }, 'MalVoluto')).toBeUndefined()
    expect(normalizeLichess({ ...base, status: 'aborted' }, 'MalVoluto')).toBeUndefined()
    expect(normalizeLichess(base, 'someoneElse')).toBeUndefined()
  })

  it('treats games without a winner as draws', () => {
    const draw = { ...recent[0]!, winner: undefined }
    expect(normalizeLichess({ ...draw, status: 'draw' }, 'MalVoluto')!.game.result).toBe('draw')
  })
})

describe('NDJSON streaming', () => {
  it('parses lines split across arbitrary chunks', async () => {
    const bytes = new TextEncoder().encode(fixtureText('lichess/malvoluto-recent.ndjson'))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 777) controller.enqueue(bytes.slice(i, i + 777))
        controller.close()
      },
    })
    const ids: string[] = []
    for await (const g of readNdjson<LichessGame>(body)) ids.push(g.id)
    expect(ids).toEqual(recent.map((g) => g.id))
  })
})

describe('Chess.com normalization', () => {
  const games = chesscom.map((g) => normalizeChesscom(g, 'AlePruner'))

  it('keeps standard games with legal moves and full clocks', () => {
    const kept = games.filter(Boolean)
    expect(kept.length).toBe(chesscom.length)
    for (const { game } of kept as NonNullable<(typeof games)[number]>[]) {
      expect(() => replaySan(game.moves)).not.toThrow()
      expect(game.clocks).toHaveLength(game.moves.length)
    }
  })

  it('maps the first game from the user’s side', () => {
    const { game } = games[0]!
    expect(game).toMatchObject({
      id: 'chesscom:eaa0b929-a706-11f1-bb1f-e68c2101000f',
      userColor: 'black',
      result: 'win',
      speed: 'blitz',
      timeControl: '180',
      termination: 'timeout',
      playedAt: 1788378694000,
    })
    expect(game.moves.slice(0, 4)).toEqual(['b3', 'e5', 'Bb2', 'f6'])
    expect(game.clocks![0]).toBe(17870)
  })

  it('maps draws and losses', () => {
    const results = new Set(games.map((g) => g!.game.result))
    expect(results).toEqual(new Set(['win', 'draw', 'loss']))
  })

  it('skips variants and non-standard starts', () => {
    const base = chesscom[0]!
    expect(normalizeChesscom({ ...base, rules: 'chess960' }, 'AlePruner')).toBeUndefined()
    expect(
      normalizeChesscom({ ...base, initial_setup: '8/8/8 w - - 0 1' }, 'AlePruner'),
    ).toBeUndefined()
  })
})
