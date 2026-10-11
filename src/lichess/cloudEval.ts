import type { ChessDb } from '../db/schema'
import type { Eval } from '../import/types'
import { cached, lichessGet, SerialQueue, type HttpDeps } from './cache'

export interface CloudPv {
  /** White's point of view. */
  eval: Eval
  moves: string[]
}

export interface CloudEval {
  depth: number
  knodes: number
  pvs: CloudPv[]
}

interface RawCloudEval {
  depth: number
  knodes: number
  pvs: { moves: string; cp?: number; mate?: number }[]
}

const DAY = 24 * 60 * 60 * 1000
const queue = new SerialQueue()

export function parseCloudEval(raw: RawCloudEval): CloudEval {
  return {
    depth: raw.depth,
    knodes: raw.knodes,
    pvs: raw.pvs.map((p) => ({
      eval: p.mate !== undefined ? { mate: p.mate } : { cp: p.cp ?? 0 },
      moves: p.moves.split(' '),
    })),
  }
}

/** Lichess cloud eval (anonymous). null when the position is not in Lichess' cache. */
export function getCloudEval(
  db: ChessDb,
  epd: string,
  deps: HttpDeps = {},
): Promise<CloudEval | null> {
  return cached(db.evalCache, `cloud|${epd}`, 7 * DAY, () =>
    queue.run(async () => {
      const url = `https://lichess.org/api/cloud-eval?${new URLSearchParams({ fen: `${epd} 0 1`, multiPv: '3' })}`
      const res = await lichessGet(url, deps)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Cloud eval: errore ${res.status}`)
      return parseCloudEval((await res.json()) as RawCloudEval)
    }),
  )
}
