import type { Color } from '../import/types'
import { RepGraph } from '../repertoire/graph'
import type { RepMove } from '../repertoire/types'
import type { ReviewLogEntry, TrainingCard } from './types'

export const cardId = (repertoireId: string, epd: string) => `${repertoireId}|${epd}`

export interface CardSync {
  put: TrainingCard[]
  remove: string[]
}

/**
 * Brings a repertoire's cards in line with its user positions: new positions get
 * a card, a changed main move resets its card, removed positions lose theirs.
 */
export function syncCards(
  repertoireId: string,
  color: Color,
  moves: readonly RepMove[],
  existing: readonly TrainingCard[],
  now: number,
): CardSync {
  const byId = new Map(existing.map((c) => [c.id, c]))
  const put: TrainingCard[] = []
  const keep = new Set<string>()
  for (const { epd, move } of new RepGraph(moves).userPositions(color)) {
    const id = cardId(repertoireId, epd)
    keep.add(id)
    const card = byId.get(id)
    if (card && card.uci === move.uci) continue
    put.push({ id, repertoireId, epd, uci: move.uci, san: move.san, updatedAt: now })
  }
  return { put, remove: existing.filter((c) => !keep.has(c.id)).map((c) => c.id) }
}

export function isDue(card: TrainingCard, now: number): boolean {
  return card.fsrs !== undefined && card.fsrs.due <= now
}

const DAY = 24 * 60 * 60 * 1000

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface TrainingStats {
  dueNow: number
  /** dueByDay[0] = due by the end of today, then each of the next 6 days. */
  dueByDay: number[]
  newAvailable: number
  introducedToday: number
  /** Share of correct answers over the last 30 days, or undefined without reviews. */
  retention?: number
  /** Consecutive days with at least one review, ending today (or yesterday). */
  streak: number
}

export function trainingStats(
  cards: readonly TrainingCard[],
  logs: readonly ReviewLogEntry[],
  now: number,
): TrainingStats {
  const today = startOfDay(now)
  const dueByDay = Array.from({ length: 7 }, (_, i) => {
    const from = i === 0 ? -Infinity : today + i * DAY
    const to = today + (i + 1) * DAY
    return cards.filter((c) => c.fsrs && c.fsrs.due >= from && c.fsrs.due < to).length
  })
  const recent = logs.filter((l) => l.reviewedAt >= now - 30 * DAY)
  const days = new Set(logs.map((l) => startOfDay(l.reviewedAt)))
  let streak = 0
  let day = days.has(today) ? today : today - DAY
  while (days.has(day)) {
    streak++
    day = startOfDay(day - DAY / 2)
  }
  return {
    dueNow: cards.filter((c) => isDue(c, now)).length,
    dueByDay,
    newAvailable: cards.filter((c) => !c.fsrs).length,
    introducedToday: cards.filter((c) => c.introducedAt !== undefined && c.introducedAt >= today)
      .length,
    ...(recent.length ? { retention: recent.filter((l) => l.correct).length / recent.length } : {}),
    streak,
  }
}

/** Cards missed most often (lapses, then wrong answers in the log). */
export function hardCards(
  cards: readonly TrainingCard[],
  logs: readonly ReviewLogEntry[],
  limit = 20,
): TrainingCard[] {
  const wrong = new Map<string, number>()
  for (const l of logs) if (!l.correct) wrong.set(l.cardId, (wrong.get(l.cardId) ?? 0) + 1)
  const score = (c: TrainingCard) => (c.fsrs?.lapses ?? 0) * 2 + (wrong.get(c.id) ?? 0)
  return cards
    .filter((c) => c.fsrs && score(c) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
}
