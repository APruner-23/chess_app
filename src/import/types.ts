export type Site = 'lichess' | 'chesscom'
export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'
export type Color = 'white' | 'black'
export type GameResult = 'win' | 'draw' | 'loss'

export interface PlayerInfo {
  name: string
  rating?: number
}

/** A standard-chess game, normalized from either site, seen from the user's side. */
export interface Game {
  /** `lichess:<gameId>` or `chesscom:<uuid>`. */
  id: string
  site: Site
  url: string
  /** Unix ms; game start on Lichess, game end on Chess.com. */
  playedAt: number
  speed: Speed
  /** "180+2", or "-" for correspondence without a clock. */
  timeControl: string
  rated: boolean
  userColor: Color
  result: GameResult
  /** Site-specific end reason, e.g. "resign", "timeout", "checkmated". */
  termination: string
  white: PlayerInfo
  black: PlayerInfo
  /** SAN moves of the main line, from the standard start position. */
  moves: string[]
  /** Remaining clock after each ply, in centiseconds, when available. */
  clocks?: number[]
  eco?: string
  openingName?: string
  /** Ply of the deepest named opening position. */
  openingPly?: number
  updatedAt: number
}

/** Engine eval from White's point of view. */
export type Eval = { cp: number } | { mate: number }

export interface PlyEval {
  eval: Eval
  /** Best move in UCI when the site judged this ply. */
  best?: string
}

/** Server analysis carried over from the import (Lichess only for now). */
export interface Analysis {
  /** Same id as the game. */
  id: string
  source: 'lichess' | 'local'
  /** plies[i] is the eval after ply i+1. */
  plies: PlyEval[]
  accuracy?: { white?: number; black?: number }
  updatedAt: number
}

/** A normalized game plus anything else the import produced for it. */
export interface ImportedGame {
  game: Game
  analysis?: Analysis
}
