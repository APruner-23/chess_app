import type { Phase } from '../chess/phase'
import { startOfDay } from '../training/cards'
import type { Motif } from './motifs'
import type { Puzzle, PuzzleProgress } from './types'

export const NEW_PUZZLES_PER_DAY = 10
/** Puzzles in one free-practice round. */
export const PRACTICE_SIZE = 20

export interface PuzzleStats {
  total: number
  due: number
  /** Never tried yet. */
  fresh: number
  /** New puzzles still allowed today. */
  newToday: number
  /** Share of puzzles tried at least once whose last attempt was right. */
  solvedShare?: number
}

export function puzzleStats(
  puzzles: readonly Puzzle[],
  progress: ReadonlyMap<string, PuzzleProgress>,
  now: number,
  perDay = NEW_PUZZLES_PER_DAY,
): PuzzleStats {
  const today = startOfDay(now)
  let due = 0
  let fresh = 0
  let tried = 0
  let right = 0
  for (const p of puzzles) {
    const pr = progress.get(p.id)
    if (!pr) {
      fresh++
      continue
    }
    tried++
    if (pr.lastCorrect) right++
    if (pr.fsrs.due <= now) due++
  }
  const introducedToday = [...progress.values()].filter((p) => p.introducedAt >= today).length
  return {
    total: puzzles.length,
    due,
    fresh,
    newToday: Math.min(fresh, Math.max(0, perDay - introducedToday)),
    ...(tried ? { solvedShare: right / tried } : {}),
  }
}

/**
 * The scheduled session: due puzzles first (oldest due first), then new ones up to
 * today's limit, blunders and recent games first.
 */
export function scheduledPuzzles(
  puzzles: readonly Puzzle[],
  progress: ReadonlyMap<string, PuzzleProgress>,
  now: number,
  perDay = NEW_PUZZLES_PER_DAY,
): Puzzle[] {
  const { newToday } = puzzleStats(puzzles, progress, now, perDay)
  const due = puzzles
    .filter((p) => (progress.get(p.id)?.fsrs.due ?? Infinity) <= now)
    .sort((a, b) => progress.get(a.id)!.fsrs.due - progress.get(b.id)!.fsrs.due)
  const fresh = puzzles
    .filter((p) => !progress.has(p.id))
    .sort(
      (a, b) =>
        Number(b.judgment === 'blunder') - Number(a.judgment === 'blunder') ||
        b.playedAt - a.playedAt,
    )
    .slice(0, newToday)
  return [...due, ...fresh]
}

export interface PracticeFilter {
  phase?: Phase
  judgment?: Puzzle['judgment']
  motif?: Motif
}

/** Free practice: a random round among the puzzles matching the filter. */
export function practicePuzzles(
  puzzles: readonly Puzzle[],
  filter: PracticeFilter,
  random: () => number = Math.random,
  size = PRACTICE_SIZE,
): Puzzle[] {
  const pool = puzzles.filter(
    (p) =>
      (!filter.phase || p.phase === filter.phase) &&
      (!filter.judgment || p.judgment === filter.judgment) &&
      (!filter.motif || p.motif === filter.motif),
  )
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, size)
}
