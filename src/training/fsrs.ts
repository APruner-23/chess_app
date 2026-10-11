import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs'
import type { StoredFsrs } from './types'

export { Rating }

/** FSRS-6 with the plan's 90% target retention. */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))

/** A move found after this long counts as Hard instead of Good. */
export const SLOW_MS = 20_000

export function gradeAnswer(correct: boolean, elapsedMs: number): Grade {
  if (!correct) return Rating.Again
  return elapsedMs > SLOW_MS ? Rating.Hard : Rating.Good
}

function toCard(s: StoredFsrs): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

function fromCard(c: Card): StoredFsrs {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    ...(c.last_review ? { last_review: c.last_review.getTime() } : {}),
  }
}

/** Schedules the next review; a missing state means a brand-new card. */
export function schedule(state: StoredFsrs | undefined, grade: Grade, now: number): StoredFsrs {
  const card = state ? toCard(state) : createEmptyCard(new Date(now))
  return fromCard(scheduler.next(card, new Date(now), grade).card)
}
