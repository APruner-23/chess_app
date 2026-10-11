import type { Table } from 'dexie'
import type { CacheEntry } from '../db/schema'

/** Returns the cached value if younger than maxAgeMs, else fetches and stores it. */
export async function cached<T>(
  table: Table<CacheEntry, string>,
  key: string,
  maxAgeMs: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = await table.get(key)
  if (hit && Date.now() - hit.fetchedAt < maxAgeMs) return hit.value as T | null
  const value = await load()
  await table.put({ key, value, fetchedAt: Date.now() })
  return value
}

/** Runs tasks strictly one after another (Lichess asks for one request at a time). */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => undefined)
    return result
  }
}

export interface HttpDeps {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export class NeedsTokenError extends Error {
  constructor() {
    super('Serve il collegamento a Lichess (Impostazioni → Collega Lichess).')
  }
}

/** GET with one retry after 60 s on 429, as Lichess asks. */
export async function lichessGet(
  url: string,
  deps: HttpDeps,
  headers?: HeadersInit,
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(url, { headers })
    if (res.status === 429 && attempt === 0) {
      await sleep(60_000)
      continue
    }
    return res
  }
}
