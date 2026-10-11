import { Engine, type WorkerLike } from './engine'
import { EngineQueue } from './queue'

let queue: EngineQueue | undefined

/**
 * The app-wide engine queue, created on first use. The multi-threaded lite build
 * needs SharedArrayBuffer (crossOriginIsolated); otherwise the single-threaded one.
 */
export function engineQueue(): EngineQueue {
  if (!queue) {
    const multi = globalThis.crossOriginIsolated === true
    const file = multi ? 'stockfish-19-lite.js' : 'stockfish-19-lite-single.js'
    const threads = multi ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1
    const engine = new Engine(
      () => new Worker(`${import.meta.env.BASE_URL}engine/${file}`) as unknown as WorkerLike,
      { threads, hashMb: 32 },
    )
    queue = new EngineQueue(engine)
  }
  return queue
}
