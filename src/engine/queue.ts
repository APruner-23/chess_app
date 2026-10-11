import type { Engine, SearchRequest, SearchResult } from './engine'

/** Lower runs first: the on-screen position, then a game the user asked for, then background work. */
export type Priority = 'live' | 'game' | 'background'
const RANK: Record<Priority, number> = { live: 0, game: 1, background: 2 }

interface Job {
  req: SearchRequest
  priority: Priority
  controller: AbortController
  /** Set when a more urgent job interrupts this one: it goes back in the queue. */
  preempted?: boolean
  resolve: (r: SearchResult) => void
  reject: (e: unknown) => void
}

export interface Handle {
  result: Promise<SearchResult>
  cancel: () => void
}

/**
 * Feeds one engine from a priority queue. A more urgent job interrupts a less
 * urgent one, which is re-queued and restarted later. A new live job replaces the old one.
 */
export class EngineQueue {
  private queue: Job[] = []
  private running?: Job

  constructor(private engine: Pick<Engine, 'search'>) {}

  submit(req: SearchRequest, priority: Priority): Handle {
    const controller = new AbortController()
    let job!: Job
    const result = new Promise<SearchResult>((resolve, reject) => {
      job = { req, priority, controller, resolve, reject }
    })
    if (priority === 'live') {
      for (const j of this.queue.filter((j) => j.priority === 'live')) this.drop(j)
      if (this.running?.priority === 'live') this.running.controller.abort()
    }
    this.queue.push(job)
    this.queue.sort((a, b) => RANK[a.priority] - RANK[b.priority])
    if (this.running && RANK[priority] < RANK[this.running.priority]) {
      this.running.preempted = true
      this.running.controller.abort()
    }
    void this.pump()
    return {
      result,
      cancel: () => {
        if (this.running === job) job.controller.abort()
        else this.drop(job)
      },
    }
  }

  private drop(job: Job) {
    this.queue = this.queue.filter((j) => j !== job)
    job.controller.abort()
    job.resolve({ lines: [] })
  }

  private async pump() {
    if (this.running) return
    const job = this.queue.shift()
    if (!job) return
    this.running = job
    try {
      const result = await this.engine.search(job.req, job.controller.signal)
      if (job.preempted) {
        job.preempted = false
        job.controller = new AbortController()
        this.queue.push(job)
        this.queue.sort((a, b) => RANK[a.priority] - RANK[b.priority])
      } else {
        job.resolve(result)
      }
    } catch (e) {
      job.reject(e)
    } finally {
      this.running = undefined
      void this.pump()
    }
  }
}
