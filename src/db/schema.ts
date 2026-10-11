import Dexie, { type Table } from 'dexie'
import type { Analysis, Color, Game, GameResult, Site, Speed } from '../import/types'
import type { RepMove, Repertoire } from '../repertoire/types'

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

/** Cached HTTP responses (explorer, cloud eval). Local only. */
export interface CacheEntry<T = unknown> {
  key: string
  /** null = the service had nothing (e.g. cloud eval 404). */
  value: T | null
  fetchedAt: number
}

export class ChessDb extends Dexie {
  repertoires!: Table<Repertoire, string>
  repMoves!: Table<RepMove, string>
  explorerCache!: Table<CacheEntry, string>
  evalCache!: Table<CacheEntry, string>
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
    this.version(2).stores({
      repertoires: 'id',
      repMoves: 'id, repertoireId, [repertoireId+fromEpd]',
      explorerCache: 'key',
      evalCache: 'key',
    })
  }
}

export const db = new ChessDb()
