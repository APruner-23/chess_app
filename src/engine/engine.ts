import { parseBestMove, parseInfo, type PvLine } from './uci'

/** The part of Worker the engine uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: string): void
  onmessage: ((e: { data: unknown }) => void) | null
  terminate(): void
}

export interface SearchRequest {
  fen: string
  multiPv?: number
  nodes?: number
  depth?: number
  /** Called with the current lines (sorted by multipv) as they deepen. */
  onInfo?: (lines: PvLine[]) => void
}

export interface SearchResult {
  lines: PvLine[]
  bestMove?: string
}

/** One Stockfish worker speaking UCI. Searches run one at a time. */
export class Engine {
  private worker: WorkerLike
  private listeners = new Set<(line: string) => void>()
  private ready: Promise<void>
  private busy: Promise<unknown> = Promise.resolve()

  constructor(createWorker: () => WorkerLike, options: { threads?: number; hashMb?: number } = {}) {
    this.worker = createWorker()
    this.worker.onmessage = (e) => {
      for (const line of String(e.data).split('\n')) {
        for (const l of this.listeners) l(line.trim())
      }
    }
    const worker = this.worker
    this.ready = (async () => {
      await this.command('uci', (l) => l === 'uciok')
      if (options.threads) worker.postMessage(`setoption name Threads value ${options.threads}`)
      if (options.hashMb) worker.postMessage(`setoption name Hash value ${options.hashMb}`)
      await this.command('isready', (l) => l === 'readyok')
    })()
  }

  private command(cmd: string, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        if (!done(line)) return
        this.listeners.delete(listener)
        resolve()
      }
      this.listeners.add(listener)
      this.worker.postMessage(cmd)
    })
  }

  /** Runs a search; aborting sends "stop" and resolves with what was found so far. */
  search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready
      const turn = req.fen.split(' ')[1] === 'b' ? 'black' : 'white'
      const multiPv = req.multiPv ?? 1
      const lines: PvLine[] = []
      let bestMove: string | undefined
      if (signal?.aborted) return { lines }
      this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
      this.worker.postMessage(`position fen ${req.fen}`)
      const limit = req.nodes ? `nodes ${req.nodes}` : req.depth ? `depth ${req.depth}` : 'infinite'
      const onAbort = () => this.worker.postMessage('stop')
      signal?.addEventListener('abort', onAbort)
      await new Promise<void>((resolve) => {
        const listener = (line: string) => {
          const info = parseInfo(line, turn)
          if (info && info.multipv <= multiPv) {
            lines[info.multipv - 1] = info
            req.onInfo?.(lines.filter(Boolean))
            return
          }
          const best = parseBestMove(line)
          if (best === null) return
          bestMove = best
          this.listeners.delete(listener)
          resolve()
        }
        this.listeners.add(listener)
        this.worker.postMessage(`go ${limit}`)
      })
      signal?.removeEventListener('abort', onAbort)
      return { lines: lines.filter(Boolean), bestMove }
    }
    const result = this.busy.then(run, run)
    this.busy = result.catch(() => undefined)
    return result
  }

  terminate() {
    this.worker.terminate()
  }
}
