import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import type { PvLine } from '../engine/uci'
import { winFor } from '../analysis/winPercent'
import { epdOf, outcomeOf, type Outcome } from '../chess/position'
import type { Color } from '../import/types'

export interface BotLevel {
  label: string
  /** Search budget per move. */
  nodes: number
  /**
   * Softmax temperature on the win% lost by each candidate move: high values pick
   * worse moves more often; 0 always plays the best one.
   */
  temperature: number
}

/** From a beginner who often blunders to full strength. */
export const BOT_LEVELS: BotLevel[] = [
  { label: 'Principiante', nodes: 20_000, temperature: 14 },
  { label: 'Facile', nodes: 40_000, temperature: 9 },
  { label: 'Club debole', nodes: 70_000, temperature: 6 },
  { label: 'Club', nodes: 120_000, temperature: 4 },
  { label: 'Club forte', nodes: 200_000, temperature: 2.5 },
  { label: 'Esperto', nodes: 350_000, temperature: 1.2 },
  { label: 'Maestro', nodes: 600_000, temperature: 0.5 },
  { label: 'Massimo', nodes: 1_000_000, temperature: 0 },
]
/** Candidate moves the bot chooses from. */
export const BOT_MULTI_PV = 5

/**
 * Picks the bot's move among the engine's candidate lines: each is weighted by
 * exp(-lost / temperature), where `lost` is the win% given up compared to the best.
 */
export function pickBotMove(
  lines: readonly PvLine[],
  turn: Color,
  level: BotLevel,
  random: () => number = Math.random,
): string | undefined {
  const cands = lines.filter((l) => l.pv[0])
  if (cands.length === 0) return undefined
  const wins = cands.map((l) => winFor(l.eval, turn))
  const best = Math.max(...wins)
  if (level.temperature <= 0) return cands[wins.indexOf(best)]!.pv[0]
  const weights = wins.map((w) => Math.exp(-(best - w) / level.temperature))
  let r = random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i]!
    if (r <= 0) return cands[i]!.pv[0]
  }
  return cands[cands.length - 1]!.pv[0]
}

export type GameEnd =
  | Outcome
  | { winner?: undefined; reason: 'repetition' | 'fifty-moves' }
  | { winner: Color; reason: 'resign' }

/** Whether the game is over after the last position of `fens` (FENs of every position). */
export function gameEnd(fens: readonly string[]): GameEnd | undefined {
  const last = fens[fens.length - 1]!
  const over = outcomeOf(last)
  if (over) return over
  const setup = parseFen(last).unwrap()
  if (setup.halfmoves >= 100) return { reason: 'fifty-moves' }
  const epd = (fen: string) => epdOf(Chess.fromSetup(parseFen(fen).unwrap()).unwrap())
  const now = epd(last)
  if (fens.filter((f) => epd(f) === now).length >= 3) return { reason: 'repetition' }
  return undefined
}

export function endText(end: GameEnd, user: Color): string {
  switch (end.reason) {
    case 'checkmate':
      return end.winner === user ? 'Hai vinto per scacco matto!' : 'Hai perso: scacco matto.'
    case 'resign':
      return 'Hai abbandonato.'
    case 'stalemate':
      return 'Patta per stallo.'
    case 'insufficient':
      return 'Patta: materiale insufficiente.'
    case 'repetition':
      return 'Patta per triplice ripetizione.'
    case 'fifty-moves':
      return 'Patta per la regola delle 50 mosse.'
  }
}

/** Below this many games a position's statistics are noise: the engine plays instead. */
export const MIN_BOOK_GAMES = 20
/** Moves played less often than this are left out (blunders seen once in a while). */
const MIN_BOOK_SHARE = 0.03

/**
 * A "human" move from explorer statistics: picked at random with the frequency players
 * of the user's level play it. Undefined when the position is too rare.
 */
export function pickBookMove(
  moves: readonly { uci: string; san: string; white: number; draws: number; black: number }[],
  random: () => number = Math.random,
): { uci: string; san: string; share: number } | undefined {
  const counted = moves.map((m) => ({ ...m, games: m.white + m.draws + m.black }))
  const total = counted.reduce((a, m) => a + m.games, 0)
  if (total < MIN_BOOK_GAMES) return undefined
  const pool = counted.filter((m) => m.games / total >= MIN_BOOK_SHARE)
  const poolTotal = pool.reduce((a, m) => a + m.games, 0)
  let r = random() * poolTotal
  for (const m of pool) {
    r -= m.games
    if (r <= 0) return { uci: m.uci, san: m.san, share: m.games / total }
  }
  const m = pool[pool.length - 1]
  return m && { uci: m.uci, san: m.san, share: m.games / total }
}
