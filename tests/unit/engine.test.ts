import { describe, expect, it } from 'vitest'
import { Engine, type WorkerLike } from '../../src/engine/engine'
import { EngineQueue } from '../../src/engine/queue'
import { parseBestMove, parseInfo } from '../../src/engine/uci'
import { analyzeGame } from '../../src/analysis/analyzeGame'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { ndjsonLines } from '../helpers'

describe('UCI parsing', () => {
  it('reads score, depth, multipv and pv, flipping for Black to move', () => {
    const line =
      'info depth 18 seldepth 25 multipv 2 score cp 34 nodes 123456 nps 300000 pv e2e4 e7e5'
    expect(parseInfo(line, 'white')).toEqual({
      multipv: 2,
      depth: 18,
      eval: { cp: 34 },
      pv: ['e2e4', 'e7e5'],
      nodes: 123456,
    })
    expect(parseInfo(line, 'black')!.eval).toEqual({ cp: -34 })
    expect(parseInfo('info depth 5 score mate -3 pv a1a8', 'black')!.eval).toEqual({ mate: 3 })
  })

  it('skips bound scores and lines without a pv', () => {
    expect(parseInfo('info depth 10 score cp 20 lowerbound pv e2e4', 'white')).toBeUndefined()
    expect(parseInfo('info string NNUE enabled', 'white')).toBeUndefined()
  })

  it('reads bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove (none)')).toBeUndefined()
    expect(parseBestMove('info depth 1')).toBeNull()
  })
})

/** Answers like Stockfish: a few info lines per search, then bestmove (immediately on stop). */
class FakeStockfish implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null
  sent: string[] = []
  private pending?: ReturnType<typeof setTimeout>
  constructor(private delayMs = 5) {}
  private emit(line: string) {
    queueMicrotask(() => this.onmessage?.({ data: line }))
  }
  postMessage(cmd: string) {
    this.sent.push(cmd)
    if (cmd === 'uci') this.emit('id name Fake\nuciok')
    else if (cmd === 'isready') this.emit('readyok')
    else if (cmd.startsWith('go')) {
      this.emit('info depth 1 multipv 1 score cp 10 nodes 10 pv e2e4')
      this.emit('info depth 1 multipv 2 score cp 5 nodes 20 pv d2d4')
      this.pending = setTimeout(() => {
        this.pending = undefined
        this.emit('info depth 2 multipv 1 score cp 25 nodes 100 pv e2e4 e7e5')
        this.emit('bestmove e2e4')
      }, this.delayMs)
    } else if (cmd === 'stop' && this.pending) {
      clearTimeout(this.pending)
      this.pending = undefined
      this.emit('bestmove e2e4')
    }
  }
  terminate() {}
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('Engine', () => {
  it('initializes, searches with MultiPV and reports progress', async () => {
    const fake = new FakeStockfish()
    const engine = new Engine(() => fake, { threads: 2, hashMb: 16 })
    const seen: number[] = []
    const result = await engine.search({
      fen: START,
      multiPv: 2,
      nodes: 1000,
      onInfo: (l) => seen.push(l.length),
    })
    expect(result.bestMove).toBe('e2e4')
    expect(result.lines.map((l) => l.eval)).toEqual([{ cp: 25 }, { cp: 5 }])
    expect(seen.at(-1)).toBe(2)
    expect(fake.sent).toContain('setoption name Threads value 2')
    expect(fake.sent).toContain('go nodes 1000')
  })

  it('stops on abort and returns the partial result', async () => {
    const engine = new Engine(() => new FakeStockfish(10_000))
    const controller = new AbortController()
    const promise = engine.search({ fen: START }, controller.signal)
    setTimeout(() => controller.abort(), 5)
    const result = await promise
    expect(result.lines[0]!.eval).toEqual({ cp: 10 })
  })

  it('runs searches one at a time', async () => {
    const fake = new FakeStockfish()
    const engine = new Engine(() => fake)
    await Promise.all([engine.search({ fen: START }), engine.search({ fen: START })])
    const order = fake.sent.filter((c) => c.startsWith('go') || c.startsWith('position'))
    expect(order).toEqual([
      `position fen ${START}`,
      'go infinite',
      `position fen ${START}`,
      'go infinite',
    ])
  })
})

describe('EngineQueue', () => {
  it('lets live work interrupt background work, then resumes it', async () => {
    const log: string[] = []
    const fakeEngine = {
      search: (req: { fen: string }, signal?: AbortSignal) =>
        new Promise<{ lines: [] }>((resolve) => {
          log.push(`start ${req.fen}`)
          const t = setTimeout(() => {
            log.push(`done ${req.fen}`)
            resolve({ lines: [] })
          }, 20)
          signal?.addEventListener('abort', () => {
            clearTimeout(t)
            log.push(`stop ${req.fen}`)
            resolve({ lines: [] })
          })
        }),
    }
    const queue = new EngineQueue(fakeEngine)
    const bg = queue.submit({ fen: 'bg' }, 'background')
    await new Promise((r) => setTimeout(r, 5))
    const live = queue.submit({ fen: 'live' }, 'live')
    await Promise.all([bg.result, live.result])
    expect(log).toEqual(['start bg', 'stop bg', 'start live', 'done live', 'start bg', 'done bg'])
  })

  it('replaces a pending live job with the newer one', async () => {
    const fens: string[] = []
    const queue = new EngineQueue({
      search: async (req) => {
        fens.push(req.fen)
        return { lines: [] }
      },
    })
    queue.submit({ fen: 'game' }, 'game')
    queue.submit({ fen: 'live1' }, 'live')
    await queue.submit({ fen: 'live2' }, 'live').result
    await new Promise((r) => setTimeout(r, 0))
    expect(fens).not.toContain('live1')
    expect(fens).toContain('live2')
  })
})

describe('analyzeGame', () => {
  const raws = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson')

  it('evaluates every position, skipping a final checkmate, like Lichess', async () => {
    const raw = raws.find((r) => r.status === 'mate')!
    const { game, analysis: server } = normalizeLichess(raw, 'MalVoluto')!
    const fens: string[] = []
    const analysis = await analyzeGame(game, async (fen) => {
      fens.push(fen)
      return { eval: { cp: fens.length }, best: `best${fens.length}` }
    })
    expect(analysis!.plies).toHaveLength(server!.plies.length)
    expect(analysis!.plies.length).toBe(game.moves.length - 1)
    // plies[0] = eval after ply 1 (second position) with the best move from the start position
    expect(analysis!.plies[0]).toEqual({ eval: { cp: 2 }, best: 'best1' })
    expect(fens[0]).toBe(START)
  })

  it('stops when aborted', async () => {
    const { game } = normalizeLichess(raws[0]!, 'MalVoluto')!
    const controller = new AbortController()
    let calls = 0
    const analysis = await analyzeGame(
      game,
      async () => {
        if (++calls === 3) controller.abort()
        return { eval: { cp: 0 } }
      },
      { signal: controller.signal },
    )
    expect(analysis).toBeUndefined()
    expect(calls).toBe(3)
  })
})
