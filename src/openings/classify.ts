import type { Opening, OpeningMap } from './types'

export interface Classification extends Opening {
  /** Ply count of the matched position (0 = start). */
  ply: number
}

/** The deepest named position reached along the game (epds[i] = position after i plies). */
export function classify(
  epds: readonly string[],
  openings: OpeningMap,
): Classification | undefined {
  for (let ply = epds.length - 1; ply > 0; ply--) {
    const hit = openings[epds[ply]!]
    if (hit) return { ...hit, ply }
  }
  return undefined
}

/** "Sicilian Defense: Najdorf Variation" → "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(':')[0]!.trim()
}
