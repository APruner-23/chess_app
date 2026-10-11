import { parseComment, parsePgn } from 'chessops/pgn'
import type { Color, Game, GameResult, ImportedGame, Speed } from './types'

export interface ChesscomPlayer {
  username: string
  rating?: number
  result: string
}

/** The subset of a Chess.com monthly-archive game we rely on. */
export interface ChesscomGame {
  url: string
  pgn?: string
  time_control: string
  end_time: number
  rated: boolean
  uuid: string
  initial_setup?: string
  time_class: string
  rules: string
  white: ChesscomPlayer
  black: ChesscomPlayer
}

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])
const SPEEDS: Record<string, Speed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'daily',
}

export function chesscomArchivesUrl(username: string): string {
  return `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`
}

/** "https://…/games/2026/09" → "2026/09". */
export function archiveMonth(url: string): string {
  return url.split('/').slice(-2).join('/')
}

/** "2026/09" for a Unix-ms timestamp (UTC, like the archive URLs). */
export function monthOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function normalizeChesscom(raw: ChesscomGame, username: string): ImportedGame | undefined {
  if (raw.rules !== 'chess' || !raw.pgn) return undefined
  if (raw.initial_setup && raw.initial_setup !== STANDARD_START) return undefined
  const me = username.toLowerCase()
  const userColor: Color | undefined =
    raw.white.username.toLowerCase() === me
      ? 'white'
      : raw.black.username.toLowerCase() === me
        ? 'black'
        : undefined
  if (!userColor) return undefined

  const parsed = parsePgn(raw.pgn)[0]
  if (!parsed) return undefined
  const moves: string[] = []
  const clocks: number[] = []
  for (const node of parsed.moves.mainline()) {
    moves.push(node.san)
    const clock = node.comments?.map((c) => parseComment(c).clock).find((c) => c !== undefined)
    if (clock !== undefined) clocks.push(Math.round(clock * 100))
  }
  if (moves.length === 0) return undefined

  const mine = raw[userColor]
  const theirs = raw[userColor === 'white' ? 'black' : 'white']
  const result: GameResult =
    mine.result === 'win' ? 'win' : DRAWS.has(mine.result) ? 'draw' : 'loss'
  const game: Game = {
    id: `chesscom:${raw.uuid}`,
    site: 'chesscom',
    url: raw.url,
    playedAt: raw.end_time * 1000,
    speed: SPEEDS[raw.time_class] ?? 'rapid',
    timeControl: raw.time_control,
    rated: raw.rated,
    userColor,
    result,
    termination: result === 'win' ? theirs.result : mine.result,
    white: { name: raw.white.username, rating: raw.white.rating },
    black: { name: raw.black.username, rating: raw.black.rating },
    moves,
    ...(clocks.length === moves.length ? { clocks } : {}),
    updatedAt: Date.now(),
  }
  return { game }
}
