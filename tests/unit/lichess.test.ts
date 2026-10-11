import { beforeEach, describe, expect, it } from 'vitest'
import { ChessDb } from '../../src/db/schema'
import { ExplorerClient, DEFAULT_EXPLORER, explorerUrl } from '../../src/lichess/explorer'
import { NeedsTokenError } from '../../src/lichess/cache'
import { getCloudEval } from '../../src/lichess/cloudEval'
import { authorizeUrl, codeChallenge, exchangeCode } from '../../src/lichess/oauth'
import { INITIAL_EPD, replaySan } from '../../src/chess/position'
import { fixtureText } from '../helpers'

let db: ChessDb
let n = 0
beforeEach(async () => {
  db = new ChessDb(`lichess-${n++}`)
  await db.open()
})

const explorerBody = JSON.stringify({
  white: 10,
  draws: 2,
  black: 8,
  moves: [{ uci: 'e2e4', san: 'e4', white: 6, draws: 1, black: 3 }],
})

describe('explorer client', () => {
  it('sends the token, caches responses and serializes requests', async () => {
    const calls: { url: string; auth: string | null }[] = []
    let inFlight = 0
    const client = new ExplorerClient({
      db,
      getToken: async () => 'tok',
      fetch: async (input, init) => {
        if (++inFlight > 1) throw new Error('parallel')
        calls.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') })
        await new Promise((r) => setTimeout(r, 2))
        inFlight--
        return new Response(explorerBody)
      },
    })
    const e4 = replaySan(['e4']).epds[1]!
    const [a] = await Promise.all([
      client.get('lichess', INITIAL_EPD, DEFAULT_EXPLORER),
      client.get('masters', e4, DEFAULT_EXPLORER),
    ])
    expect(a.moves[0]!.san).toBe('e4')
    await client.get('lichess', INITIAL_EPD, DEFAULT_EXPLORER)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.auth).toBe('Bearer tok')
    expect(calls[0]!.url).toContain('ratings=1200%2C1400%2C1600')
    expect(calls[1]!.url).not.toContain('ratings')
    expect(await client.peek('lichess', INITIAL_EPD, DEFAULT_EXPLORER)).toEqual(a)
  })

  it('asks for a token when missing or rejected', async () => {
    const noToken = new ExplorerClient({ db, getToken: async () => undefined })
    await expect(noToken.get('lichess', INITIAL_EPD, DEFAULT_EXPLORER)).rejects.toBeInstanceOf(
      NeedsTokenError,
    )
    const rejected = new ExplorerClient({
      db,
      getToken: async () => 'bad',
      fetch: async () => new Response('', { status: 401 }),
    })
    await expect(rejected.get('lichess', INITIAL_EPD, DEFAULT_EXPLORER)).rejects.toBeInstanceOf(
      NeedsTokenError,
    )
  })

  it('waits 60 s after a 429', async () => {
    const waits: number[] = []
    let first = true
    const client = new ExplorerClient({
      db,
      getToken: async () => 'tok',
      sleep: async (ms) => void waits.push(ms),
      fetch: async () => {
        if (first) {
          first = false
          return new Response('', { status: 429 })
        }
        return new Response(explorerBody)
      },
    })
    await client.get('lichess', INITIAL_EPD, DEFAULT_EXPLORER)
    expect(waits).toEqual([60_000])
  })

  it('builds the URL with a full FEN', () => {
    expect(explorerUrl('masters', INITIAL_EPD, DEFAULT_EXPLORER)).toContain(
      'fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F8%2F8%2FPPPPPPPP%2FRNBQKBNR+w+KQkq+-+0+1',
    )
  })
})

describe('cloud eval', () => {
  it('parses evals from White’s point of view and caches 404s', async () => {
    const e4 = replaySan(['e4']).epds[1]!
    const calls: string[] = []
    const fetchFx: typeof fetch = async (input) => {
      calls.push(String(input))
      return String(input).includes('4P3')
        ? new Response(fixtureText('lichess/cloud-eval-after-e4.json'))
        : new Response('', { status: 404 })
    }
    const ev = await getCloudEval(db, e4, { fetch: fetchFx })
    expect(ev!.pvs[0]).toMatchObject({ eval: { cp: 22 }, moves: expect.arrayContaining(['e7e5']) })
    expect(await getCloudEval(db, INITIAL_EPD, { fetch: fetchFx })).toBeNull()
    expect(await getCloudEval(db, INITIAL_EPD, { fetch: fetchFx })).toBeNull()
    expect(calls).toHaveLength(2)
  })
})

describe('OAuth PKCE', () => {
  it('computes the S256 challenge (RFC 7636 test vector)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('builds the authorize URL and exchanges the code', async () => {
    const url = new URL(
      authorizeUrl({ redirectUri: 'https://x.dev/oauth', challenge: 'c', state: 's' }),
    )
    expect(url.origin + url.pathname).toBe('https://lichess.org/oauth')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    let body = ''
    const token = await exchangeCode({
      code: 'abc',
      verifier: 'v',
      redirectUri: 'https://x.dev/oauth',
      fetch: async (_, init) => {
        body = String(init?.body)
        return new Response(JSON.stringify({ access_token: 'lio_123' }))
      },
    })
    expect(token).toBe('lio_123')
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code_verifier=v')
  })
})
