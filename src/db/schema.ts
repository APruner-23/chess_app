import Dexie, { type Table } from 'dexie'
import type { Analysis, Color, Game, GameResult, Site, Speed } from '../import/types'

/** One configured account per site. */
export interface Account {
  /** The site itself: one account per site. */
  id: Site
  username: string
  /**
   * Where the next import resumes: a createdAt ms timestamp for Lichess, an
   * archive month ("2026/09") for Chess.com. Reset when the username changes.
   */
  cursor?: number | string
  lastImportAt?: number
  updatedAt: number
}

/** Index of the first plies of every game, keyed by normalized EPD. Local only. */
export interface GamePosition {
  /** `<gameId>|<ply>` */
  id: string
  gameId: string
  epd: string
  ply: number
  /** SAN played from this position, if the game continued. */
  san?: string
  userColor: Color
  result: GameResult
  speed: Speed
  playedAt: number
}

export interface Setting<T = unknown> {
  key: string
  value: T
  updatedAt: number
}

export class ChessDb extends Dexie {
  accounts!: Table<Account, Site>
  games!: Table<Game, string>
  analyses!: Table<Analysis, string>
  gamePositions!: Table<GamePosition, string>
  settings!: Table<Setting, string>

  constructor(name = 'chess_app') {
    super(name)
    this.version(1).stores({
      accounts: 'id',
      games: 'id, playedAt, site, speed',
      analyses: 'id',
      gamePositions: 'id, epd, gameId',
      settings: 'key',
    })
  }
}

export const db = new ChessDb()
