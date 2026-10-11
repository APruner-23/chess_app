import { Engine, type WorkerLike } from './engine'
import { EngineQueue } from './queue'

let queue: EngineQueue | undefined

/**
 * The app-wide engine queue, created on first use. Always the single-threaded lite
 * build: the multi-threaded one was only ~30% faster in tests, but failed to allocate
 * its shared memory unpredictably (after other engine instances, and from the
 * offline cache), leaving no memory for a fallback. Phones have tighter limits still.
 */
export function engineQueue(): EngineQueue {
  if (!queue) {
    const create = () =>
      new Worker(
        `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
      ) as unknown as WorkerLike
    queue = new EngineQueue(new Engine([{ create, threads: 1 }], { hashMb: 32 }))
  }
  return queue
}
