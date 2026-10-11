import type { OpeningMap } from './types'

let cached: Promise<OpeningMap> | undefined

/** Lazily loads the ~500 KB opening map as its own chunk. */
export function loadOpenings(): Promise<OpeningMap> {
  cached ??= import('./openings.json').then((m) => m.default as OpeningMap)
  return cached
}
