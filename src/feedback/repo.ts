import type { ChessDb } from '../db/schema'
import { INITIAL_EPD } from '../chess/position'
import { RepGraph } from '../repertoire/graph'
import { addLine, loadMoves, setMainMove } from '../repertoire/repo'
import { cardId } from '../training/cards'
import { recordAnswer } from '../training/repo'
import { compareGame, type RepertoireWithGraph } from './compareGame'
import type { FeedbackItem } from './types'

/**
 * Recompares every game with the current repertoires. Items keep the status the
 * user gave them; items that no longer apply (repertoire changed) are dropped.
 */
export async function processFeedback(db: ChessDb): Promise<number> {
  const reps: RepertoireWithGraph[] = []
  for (const repertoire of await db.repertoires.toArray()) {
    reps.push({ repertoire, graph: new RepGraph(await loadMoves(db, repertoire.id)) })
  }
  const existing = new Map((await db.feedback.toArray()).map((f) => [f.id, f]))
  const fresh: FeedbackItem[] = []
  const analyses = new Map((await db.analyses.toArray()).map((a) => [a.id, a]))
  await db.games.each((game) => {
    for (const item of compareGame(game, reps, analyses.get(game.id))) {
      const old = existing.get(item.id)
      // Keep the user's decision unless the item now points at a different move.
      const same = old && old.epd === item.epd && old.san === item.san
      fresh.push(
        same && old.status !== 'open'
          ? { ...item, status: old.status, updatedAt: old.updatedAt }
          : item,
      )
    }
  })
  const keep = new Set(fresh.map((f) => f.id))
  await db.transaction('rw', db.feedback, async () => {
    await db.feedback.bulkDelete([...existing.keys()].filter((id) => !keep.has(id)))
    await db.feedback.bulkPut(fresh)
  })
  return fresh.filter((f) => f.status === 'open').length
}

async function setStatus(db: ChessDb, items: FeedbackItem[], status: FeedbackItem['status']) {
  const now = Date.now()
  await db.feedback.bulkPut(items.map((f) => ({ ...f, status, updatedAt: now })))
}

export const ignore = (db: ChessDb, items: FeedbackItem[]) => setStatus(db, items, 'ignored')

/** Deviation, "dimenticata": the card goes back to review right away (graded Again). */
export async function markForgotten(db: ChessDb, items: FeedbackItem[]) {
  const first = items[0]!
  const card = await db.cards.get(cardId(first.repertoireId, first.epd))
  if (card?.fsrs) await recordAnswer(db, card, 'review', false, 0)
  await setStatus(db, items, 'done')
}

/** Deviation, "scelta voluta": keep the played move as an alternative, or as the new main move. */
export async function acceptDeviation(db: ChessDb, items: FeedbackItem[], asMain: boolean) {
  const first = items[0]!
  await addLine(db, first.repertoireId, first.epd, [first.san!])
  if (asMain) {
    const moves = await loadMoves(db, first.repertoireId)
    const move = moves.find((m) => m.fromEpd === first.epd && m.san === first.san)
    if (move) await setMainMove(db, move)
  }
  await setStatus(db, items, 'done')
}

/** Extend: adds the game moves from the book exit plus the engine move. */
export async function extendLine(db: ChessDb, items: FeedbackItem[]) {
  const first = items[0]!
  await addLine(db, first.repertoireId, INITIAL_EPD, [...first.path, first.bestSan!])
  await setStatus(db, items, 'done')
}

export const markDone = (db: ChessDb, items: FeedbackItem[]) => setStatus(db, items, 'done')
