import type { ChessDb } from '../db/schema'
import { loadMoves } from '../repertoire/repo'
import { syncCards } from './cards'
import { gradeAnswer, Rating, schedule } from './fsrs'
import type { TrainingCard } from './types'

export const NEW_PER_DAY_KEY = 'newCardsPerDay'
export const DEFAULT_NEW_PER_DAY = 10

/** Re-derives the cards of every repertoire from its current moves. */
export async function syncAllCards(db: ChessDb, now = Date.now()): Promise<void> {
  const reps = await db.repertoires.toArray()
  await db.transaction('rw', db.cards, db.repMoves, async () => {
    const known = new Set(reps.map((r) => r.id))
    // Cards of deleted repertoires.
    await db.cards.filter((c) => !known.has(c.repertoireId)).delete()
    for (const rep of reps) {
      const existing = await db.cards.where('repertoireId').equals(rep.id).toArray()
      const { put, remove } = syncCards(
        rep.id,
        rep.color,
        await loadMoves(db, rep.id),
        existing,
        now,
      )
      if (put.length) await db.cards.bulkPut(put)
      if (remove.length) await db.cards.bulkDelete(remove)
    }
  })
}

export type AnswerMode = 'learn' | 'review' | 'practice'

/**
 * Records an answer. Learning introduces the card on its first correct answer; reviewing
 * schedules it with FSRS; practice (hard cards) changes nothing.
 */
export async function recordAnswer(
  db: ChessDb,
  card: TrainingCard,
  mode: AnswerMode,
  correct: boolean,
  elapsedMs: number,
  now = Date.now(),
): Promise<void> {
  if (mode === 'practice' || (mode === 'learn' && !correct)) return
  const rating = mode === 'learn' ? Rating.Good : gradeAnswer(correct, elapsedMs)
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const current = (await db.cards.get(card.id)) ?? card
    await db.cards.put({
      ...current,
      fsrs: schedule(mode === 'learn' ? undefined : current.fsrs, rating, now),
      ...(mode === 'learn' ? { introducedAt: now } : {}),
      updatedAt: now,
    })
    await db.reviewLogs.add({
      id: `${card.id}|${now}`,
      cardId: card.id,
      repertoireId: card.repertoireId,
      reviewedAt: now,
      rating,
      correct,
      elapsedMs,
      updatedAt: now,
    })
  })
}
