import type { Color } from '../import/types'

export interface Repertoire {
  /** Random id, fixed at creation. */
  id: string
  name: string
  /** The side the user plays in this repertoire. */
  color: Color
  /** Lines being tried out; compared with the main ones in the stats. */
  experimental: boolean
  createdAt: number
  updatedAt: number
}

/** One edge of the repertoire graph: a move from one position to another. */
export interface RepMove {
  /** `<repertoireId>|<fromEpd>|<uci>` */
  id: string
  repertoireId: string
  fromEpd: string
  toEpd: string
  uci: string
  san: string
  /** The idea behind the move, shown while learning. */
  note?: string
  /** 0 = main move from this position; alternatives follow. */
  order: number
  updatedAt: number
}
