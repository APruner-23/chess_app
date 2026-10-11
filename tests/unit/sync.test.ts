import { beforeEach, describe, expect, it } from 'vitest'
import { ChessDb, type Account } from '../../src/db/schema'
import { importChesscom, importLichess } from '../../src/import/sync'
import openingsJson from '../../src/openings/openings.json'
import type { OpeningMap } from '../../src/openings/types'
import { fixtureText } from '../helpers'

const openings = openingsJson as OpeningMap
let db: ChessDb
let n = 0

beforeEach(async () => {
  db = new ChessDb(`test-${n++}`)
  await db.open()
})

const lichess: Account = { id: 'lichess', username: 'MalVoluto', updatedAt: 0 }
const chesscom: Account = { id: 'chesscom', username: 'AlePruner', updatedAt: 0 }

function lichessFetch(calls: string[]): typeof fetch {
  return async (input) => {
    calls.push(String(input))
    return new Response(fixtureText('lichess/malvoluto-recent.ndjson'))
  }
}

describe('Lichess import', () => {
  it('stores games, analyses, positions and the resume cursor', async () => {
    const calls: string[] = []
    const saved = await importLichess(lichess, { db, openings, fetch: lichessFetch(calls) })
    expect(saved).toBe(30)
    expect(await db.games.count()).toBe(30)
    expect(await db.analyses.count()).toBe(4)

    const game = await db.games.get('lichess:YA9N5kBk')
    expect(game).toMatchObject({ eco: 'B10', openingName: expect.stringMatching(/^Caro-Kann/) })
    const positions = await db.gamePositions.where('gameId').equals(game!.id).toArray()
    expect(positions).toHaveLength(game!.moves.length + 1)
    expect(positions.find((p) => p.ply === 0)?.san).toBe('e4')

    const account = await db.accounts.get('lichess')
    expect(typeof account!.cursor).toBe('number')
    expect(account!.lastImportAt).toBeGreaterThan(0)
  })

  it('resumes from the cursor and is idempotent', async () => {
    const calls: string[] = []
    await importLichess(lichess, { db, openings, fetch: lichessFetch(calls) })
    const account = (await db.accounts.get('lichess'))!
    await importLichess(account, { db, openings, fetch: lichessFetch(calls) })
    expect(new URL(calls[1]!).searchParams.get('since')).toBe(String(account.cursor))
    expect(await db.games.count()).toBe(30)
  })

  it('reports a missing user', async () => {
    const fetch404: typeof fetch = async () => new Response('', { status: 404 })
    await expect(importLichess(lichess, { db, openings, fetch: fetch404 })).rejects.toThrow(
      /Utente non trovato/,
    )
  })
})

describe('Chess.com import', () => {
  const month = fixtureText('chesscom/alepruner-2026-09.json')
  const archives = JSON.stringify({
    archives: [
      'https://api.chess.com/pub/player/alepruner/games/2026/08',
      'https://api.chess.com/pub/player/alepruner/games/2026/09',
    ],
  })

  /** Serves the fixtures and fails if two requests ever overlap. */
  function serialFetch(calls: string[], opts: { rateLimitOnce?: boolean } = {}): typeof fetch {
    let inFlight = 0
    let limited = false
    return async (input) => {
      const url = String(input)
      calls.push(url)
      if (++inFlight > 1) throw new Error('parallel request')
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      if (opts.rateLimitOnce && !limited && url.endsWith('/09')) {
        limited = true
        return new Response('', { status: 429 })
      }
      if (url.endsWith('/archives')) return new Response(archives)
      if (url.endsWith('/09')) return new Response(month)
      return new Response(JSON.stringify({ games: [] }))
    }
  }

  it('fetches archives serially and saves the games', async () => {
    const calls: string[] = []
    const saved = await importChesscom(chesscom, { db, openings, fetch: serialFetch(calls) })
    expect(saved).toBe(87)
    expect(calls.map((c) => c.split('/').slice(-2).join('/'))).toEqual([
      'games/archives',
      '2026/08',
      '2026/09',
    ])
    expect((await db.accounts.get('chesscom'))!.cursor).toBe('2026/09')
  })

  it('starts from the cursor month and re-fetches it', async () => {
    const calls: string[] = []
    await importChesscom(
      { ...chesscom, cursor: '2026/09' },
      { db, openings, fetch: serialFetch(calls) },
    )
    expect(calls.slice(1).map((c) => c.slice(-7))).toEqual(['2026/09'])
  })

  it('honours the import period on the first run', async () => {
    const calls: string[] = []
    const since = Date.UTC(2026, 8, 15)
    const saved = await importChesscom(chesscom, {
      db,
      openings,
      since,
      fetch: serialFetch(calls),
    })
    expect(calls).toHaveLength(2)
    const games = await db.games.toArray()
    expect(saved).toBe(games.length)
    expect(games.every((g) => g.playedAt >= since)).toBe(true)
  })

  it('waits and retries on 429', async () => {
    const calls: string[] = []
    const waits: number[] = []
    const saved = await importChesscom(chesscom, {
      db,
      openings,
      fetch: serialFetch(calls, { rateLimitOnce: true }),
      sleep: async (ms) => void waits.push(ms),
    })
    expect(waits).toEqual([60_000])
    expect(saved).toBe(87)
  })
})
