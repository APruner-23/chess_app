export interface Opening {
  eco: string
  name: string
}

/** Normalized EPD → opening, built from data/chess-openings by scripts/build-openings.ts. */
export type OpeningMap = Record<string, Opening>
