import type { GameFacts } from '../analysis/facts'
import type { Phase } from '../chess/phase'
import type { Game, GameResult } from '../import/types'
import { scoreOf, type Score } from './games'

/** Base time and increment in seconds; undefined without a clock (daily games). */
export function parseTimeControl(tc: string): { base: number; inc: number } | undefined {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc)
  if (!m) return undefined
  return { base: Number(m[1]), inc: Number(m[2] ?? 0) }
}

export interface PlyTime {
  ply: number
  /** Seconds spent on the move. */
  spent: number
  /** Seconds on the mover's clock before the move. */
  before: number
}

/**
 * Time spent on each move, from the clock after each ply (centiseconds):
 * before − after + increment. Undefined when the game has no usable clocks.
 */
export function plyTimes(game: Game): { base: number; plies: PlyTime[] } | undefined {
  const tc = parseTimeControl(game.timeControl)
  const clocks = game.clocks
  if (!tc || !clocks || clocks.length < 2 || tc.base === 0) return undefined
  const plies = clocks.map((after, ply) => {
    const before = ply >= 2 ? clocks[ply - 2]! / 100 : tc.base
    return { ply, before, spent: Math.max(0, before - after / 100 + tc.inc) }
  })
  return { base: tc.base, plies }
}

const isUser = (game: Game, ply: number) => ply % 2 === (game.userColor === 'white' ? 0 : 1)

export const MOVE_BUCKETS = ['1–10', '11–20', '21–30', '31–40', '41+']
const bucketOf = (ply: number) => Math.min(4, Math.floor(ply / 2 / 10))

/** Clock checkpoints (move numbers) for the time-left comparison. */
export const CHECKPOINTS = [10, 20, 30, 40]

/** Below this share of the base time the player is in time trouble. */
export const ZEITNOT = 0.1

export const THINK_BUCKETS = ['Istantanea', 'Rapida', 'Normale', 'Lunga']
/** Think time as a share of the base time: <1%, 1–3%, 3–8%, ≥8%. */
const thinkBucket = (spent: number, base: number) => {
  const r = spent / base
  return r < 0.01 ? 0 : r < 0.03 ? 1 : r < 0.08 ? 2 : 3
}
/** The first moves are usually played from memory: left out of the error rates. */
const SKIP_PLIES = 10

interface Rate {
  moves: number
  errors: number
}
const rate = (r: Rate) => (r.moves ? r.errors / r.moves : undefined)

export interface TimeStats {
  /** Games with clocks among those given. */
  games: number
  /** Average seconds per move by move-number bucket, user vs opponents. */
  perMove: { bucket: string; user?: number; opp?: number }[]
  /** Average share of the base time left at each checkpoint. */
  clockLeft: { move: number; user?: number; opp?: number }[]
  /** Analyzed games only: share of moves that were mistakes or blunders. */
  errorsByThink: { bucket: string; moves: number; rate?: number }[]
  zeitnot: { normal?: number; trouble?: number; troubleMoves: number }
  /** Score of games where the user fell below the time-trouble line vs the others. */
  lowClock: { low: Score; ok: Score }
  /** Losses on time, wins on time. */
  lostOnTime: number
  wonOnTime: number
  losses: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

export function timeStats(
  games: readonly Game[],
  facts: ReadonlyMap<string, GameFacts>,
): TimeStats {
  const perMove = MOVE_BUCKETS.map(() => ({ user: [] as number[], opp: [] as number[] }))
  const left = CHECKPOINTS.map(() => ({ user: [] as number[], opp: [] as number[] }))
  const think: Rate[] = THINK_BUCKETS.map(() => ({ moves: 0, errors: 0 }))
  const zeit = { normal: { moves: 0, errors: 0 }, trouble: { moves: 0, errors: 0 } }
  const low: GameResult[] = []
  const ok: GameResult[] = []
  let n = 0
  let lostOnTime = 0
  let wonOnTime = 0
  let losses = 0
  for (const g of games) {
    if (g.result === 'loss') losses++
    const timeout = g.termination === 'outoftime' || g.termination === 'timeout'
    if (timeout && g.result === 'loss') lostOnTime++
    if (timeout && g.result === 'win') wonOnTime++
    const t = plyTimes(g)
    if (!t) continue
    n++
    const a = facts.get(g.id)
    const errors = new Set<number>()
    if (a) for (const ply of a.errorPlies) errors.add(ply)
    let wentLow = false
    for (const p of t.plies) {
      const mine = isUser(g, p.ply)
      perMove[bucketOf(p.ply)]![mine ? 'user' : 'opp'].push(p.spent)
      const move = Math.floor(p.ply / 2) + 1
      const cp = CHECKPOINTS.indexOf(move)
      // Clock left after the mover's move number `move`.
      if (cp >= 0) left[cp]![mine ? 'user' : 'opp'].push((p.before - p.spent) / t.base)
      if (!mine) continue
      const trouble = p.before < ZEITNOT * t.base
      if (trouble) wentLow = true
      if (!a || p.ply < SKIP_PLIES || p.ply >= a.plies) continue
      const err = errors.has(p.ply) ? 1 : 0
      const b = think[thinkBucket(p.spent, t.base)]!
      b.moves++
      b.errors += err
      const z = zeit[trouble ? 'trouble' : 'normal']
      z.moves++
      z.errors += err
    }
    ;(wentLow ? low : ok).push(g.result)
  }
  return {
    games: n,
    perMove: perMove.map((b, i) => ({
      bucket: MOVE_BUCKETS[i]!,
      user: avg(b.user),
      opp: avg(b.opp),
    })),
    clockLeft: left.map((b, i) => ({ move: CHECKPOINTS[i]!, user: avg(b.user), opp: avg(b.opp) })),
    errorsByThink: think.map((r, i) => ({
      bucket: THINK_BUCKETS[i]!,
      moves: r.moves,
      rate: rate(r),
    })),
    zeitnot: {
      normal: rate(zeit.normal),
      trouble: rate(zeit.trouble),
      troubleMoves: zeit.trouble.moves,
    },
    lowClock: { low: scoreOf(low), ok: scoreOf(ok) },
    lostOnTime,
    wonOnTime,
    losses,
  }
}

export interface PhaseErrors {
  phase: Phase
  moves: number
  /** Mistakes and blunders per 100 moves. */
  errorsPer100?: number
  blunders: number
  /** Average win% the user gave up per move. */
  avgLoss?: number
}

const PHASES = ['opening', 'middlegame', 'endgame'] as const

/** The user's errors by game phase, from the analyzed games. */
export function errorsByPhase(
  games: readonly Game[],
  facts: ReadonlyMap<string, GameFacts>,
): PhaseErrors[] {
  const acc: Record<Phase, { moves: number; errors: number; blunders: number; loss: number }> = {
    opening: { moves: 0, errors: 0, blunders: 0, loss: 0 },
    middlegame: { moves: 0, errors: 0, blunders: 0, loss: 0 },
    endgame: { moves: 0, errors: 0, blunders: 0, loss: 0 },
  }
  for (const g of games) {
    const tally = facts.get(g.id)?.phases
    if (!tally) continue
    for (const phase of PHASES) {
      const r = acc[phase]
      const t = tally[phase]
      r.moves += t.moves
      r.errors += t.errors
      r.blunders += t.blunders
      r.loss += t.loss
    }
  }
  return PHASES.map((phase) => {
    const r = acc[phase]
    return {
      phase,
      moves: r.moves,
      blunders: r.blunders,
      ...(r.moves ? { errorsPer100: (r.errors / r.moves) * 100, avgLoss: r.loss / r.moves } : {}),
    }
  })
}
