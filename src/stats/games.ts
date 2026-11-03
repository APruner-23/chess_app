import type { Game, GameResult, Speed } from '../import/types'

export interface GameFilter {
  speed?: Speed
  /** Only games from the last N months. */
  months?: number
}

const MONTH = 30.44 * 24 * 60 * 60 * 1000

export function filterGames(games: readonly Game[], f: GameFilter, now: number): Game[] {
  const since = f.months ? now - f.months * MONTH : -Infinity
  return games.filter((g) => (!f.speed || g.speed === f.speed) && g.playedAt >= since)
}

export interface Score {
  games: number
  wins: number
  draws: number
  losses: number
  /** Points per game, 0…1 (undefined without games). */
  score?: number
}

export function scoreOf(results: readonly GameResult[]): Score {
  const s = { games: results.length, wins: 0, draws: 0, losses: 0 }
  for (const r of results) s[r === 'win' ? 'wins' : r === 'draw' ? 'draws' : 'losses']++
  return s.games ? { ...s, score: (s.wins + s.draws / 2) / s.games } : s
}

export type EndKind = 'mate' | 'resign' | 'time' | 'abandon' | 'draw'
export const END_LABELS: Record<EndKind, string> = {
  mate: 'Scacco matto',
  resign: 'Abbandono',
  time: 'Tempo',
  abandon: 'Partita abbandonata',
  draw: 'Patta',
}

/** Groups the sites' end reasons (Lichess status, Chess.com result codes). */
export function endKind(g: Game): EndKind {
  if (g.result === 'draw') return 'draw'
  const t = g.termination
  if (t === 'mate' || t === 'checkmated') return 'mate'
  if (t === 'outoftime' || t === 'timeout') return 'time'
  if (t === 'abandoned' || t === 'noStart') return 'abandon'
  return 'resign'
}

/** How the user's wins and losses ended. */
export function endings(games: readonly Game[]): { kind: EndKind; wins: number; losses: number }[] {
  const rows = new Map<EndKind, { wins: number; losses: number }>()
  for (const g of games) {
    if (g.result === 'draw') continue
    const k = endKind(g)
    const r = rows.get(k) ?? { wins: 0, losses: 0 }
    r[g.result === 'win' ? 'wins' : 'losses']++
    rows.set(k, r)
  }
  return [...rows]
    .map(([kind, r]) => ({ kind, ...r }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses))
}

const userRating = (g: Game) => (g.userColor === 'white' ? g.white : g.black).rating
const oppRating = (g: Game) => (g.userColor === 'white' ? g.black : g.white).rating

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** Score by opponent's rating minus the user's, in 100-point bands clamped to ±300. */
export function scoreByRatingGap(
  games: readonly Game[],
): { gap: number; label: string; s: Score }[] {
  const bands = new Map<number, GameResult[]>()
  for (const g of games) {
    const mine = userRating(g)
    const theirs = oppRating(g)
    if (!mine || !theirs) continue
    const gap = Math.max(-300, Math.min(300, Math.floor((theirs - mine) / 100) * 100))
    bands.set(gap, [...(bands.get(gap) ?? []), g.result])
  }
  return [...bands]
    .sort(([a], [b]) => a - b)
    .map(([gap, rs]) => ({
      gap,
      label: gap <= -300 ? '≤ −300' : gap >= 300 ? '≥ +300' : `${signed(gap)}…${signed(gap + 100)}`,
      s: scoreOf(rs),
    }))
}

export const DAY_PARTS = ['Notte (0–6)', 'Mattina (6–12)', 'Pomeriggio (12–18)', 'Sera (18–24)']

/** Score by time of day (local time). */
export function scoreByDayPart(games: readonly Game[]): { label: string; s: Score }[] {
  const parts: GameResult[][] = [[], [], [], []]
  for (const g of games) parts[Math.floor(new Date(g.playedAt).getHours() / 6)]!.push(g.result)
  return parts.map((rs, i) => ({ label: DAY_PARTS[i]!, s: scoreOf(rs) }))
}

/** Two games closer than this belong to the same session. */
export const SESSION_GAP = 60 * 60 * 1000

/**
 * "Tilt": score of a game depending on how the previous game of the same session
 * ended (or the first game of a session).
 */
export function scoreAfterResult(games: readonly Game[]): Record<'first' | GameResult, Score> {
  const sorted = [...games].sort((a, b) => a.playedAt - b.playedAt)
  const by: Record<'first' | GameResult, GameResult[]> = { first: [], win: [], draw: [], loss: [] }
  sorted.forEach((g, i) => {
    const prev = sorted[i - 1]
    const key = prev && g.playedAt - prev.playedAt < SESSION_GAP ? prev.result : 'first'
    by[key].push(g.result)
  })
  return {
    first: scoreOf(by.first),
    win: scoreOf(by.win),
    draw: scoreOf(by.draw),
    loss: scoreOf(by.loss),
  }
}

/**
 * Rating change over the last `days`: latest rating minus the last one before the
 * window (or the first in it). Undefined with fewer than two points.
 */
export function ratingChange(
  series: readonly { t: number; rating: number }[],
  now: number,
  days = 30,
): number | undefined {
  if (series.length < 2) return undefined
  const since = now - days * 24 * 60 * 60 * 1000
  const before = series.filter((p) => p.t < since).at(-1) ?? series[0]!
  return series[series.length - 1]!.rating - before.rating
}
