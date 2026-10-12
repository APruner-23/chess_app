import { Engine, type WorkerLike } from './engine'
import { EngineQueue } from './queue'

const queues: Partial<Record<EngineRole, EngineQueue>> = {}

/**
 * `live` analyzes the position on screen; `analysis` runs whole-game analyses (asked for
 * or in the background). Two separate engines, so looking at a position never pauses a
 * game analysis running elsewhere in the app.
 */
export type EngineRole = 'live' | 'analysis'

/**
 * The app-wide engine queue for a role, created on first use. Always the single-threaded
 * lite build: the multi-threaded one was only ~30% faster in tests, but failed to allocate
 * its shared memory unpredictably (after other engine instances, and from the offline
 * cache), leaving no memory for a fallback. Phones have tighter limits still.
 */
export function engineQueue(role: EngineRole): EngineQueue {
  let queue = queues[role]
  if (!queue) {
    const create = () =>
      new Worker(
        `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
      ) as unknown as WorkerLike
    queue = new EngineQueue(new Engine([{ create, threads: 1 }], { hashMb: 32 }))
    queues[role] = queue
  }
  return queue
}
