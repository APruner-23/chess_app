import { startOfDay } from '../training/cards'
import type { PuzzleProgress } from '../puzzles/types'
import { ENDGAMES, type Endgame } from './catalog'

/** Progress on an endgame exercise: same shape as a puzzle's. */
export type EndgameProgress = PuzzleProgress

export const NEW_ENDGAMES_PER_DAY = 2

export type EndgameStatus =
  { kind: 'new' } | { kind: 'due' } | { kind: 'scheduled'; due: number; lastCorrect: boolean }

export function endgameStatus(
  id: string,
  progress: ReadonlyMap<string, EndgameProgress>,
  now: number,
): EndgameStatus {
  const p = progress.get(id)
  if (!p) return { kind: 'new' }
  return p.fsrs.due <= now
    ? { kind: 'due' }
    : { kind: 'scheduled', due: p.fsrs.due, lastCorrect: p.lastCorrect }
}

/** Today's session: due exercises (oldest first), then new ones in catalog order. */
export function endgamesToday(
  progress: ReadonlyMap<string, EndgameProgress>,
  now: number,
  catalog: readonly Endgame[] = ENDGAMES,
  perDay = NEW_ENDGAMES_PER_DAY,
): Endgame[] {
  const today = startOfDay(now)
  const introduced = [...progress.values()].filter((p) => p.introducedAt >= today).length
  const due = catalog
    .filter((e) => (progress.get(e.id)?.fsrs.due ?? Infinity) <= now)
    .sort((a, b) => progress.get(a.id)!.fsrs.due - progress.get(b.id)!.fsrs.due)
  const fresh = catalog
    .filter((e) => !progress.has(e.id))
    .slice(0, Math.max(0, perDay - introduced))
  return [...due, ...fresh]
}
