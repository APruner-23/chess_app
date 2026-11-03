import type { ChessDb } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { FEEDBACK_SOURCE_SETTING } from '../sync/sync'
import { INITIAL_EPD } from '../chess/position'
import { RepGraph } from '../repertoire/graph'
import { addLine, loadMoves, setMainMove } from '../repertoire/repo'
import { cardId } from '../training/cards'
import { recordAnswer } from '../training/repo'
import { compareGame, type RepertoireWithGraph } from './compareGame'
import type { FeedbackItem } from './types'

/** Same content, ignoring when it was computed. */
function sameItem(a: FeedbackItem, b: FeedbackItem): boolean {
  // Items are always built by compareGame, so their keys come in the same order.
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })
}

/**
 * A cheap fingerprint of everything feedback depends on: games, analyses, repertoires.
 * Reading every game and analysis takes seconds on a phone with thousands of games,
 * so the comparison only runs when this changes.
 */
async function feedbackInputs(db: ChessDb): Promise<string> {
  const reps = await db.repertoires.toArray()
  return JSON.stringify([
    await db.games.count(),
    (await db.accounts.toArray()).map((a) => a.lastImportAt ?? 0),
    await db.analyses.count(),
    (await db.analyses.orderBy('updatedAt').lastKey()) ?? 0,
    reps.map((r) => `${r.id}:${r.updatedAt}:${r.createdAt}`).sort(),
    await db.repMoves.count(),
  ])
}

const openCount = (db: ChessDb) => db.feedback.where('status').equals('open').count()

/**
 * Recompares every game with the current repertoires. Items keep the status the
 * user gave them; items that no longer apply (repertoire changed) are dropped.
 * Skipped when nothing it depends on changed since the last run on this device.
 */
export async function processFeedback(db: ChessDb): Promise<number> {
  const inputs = await feedbackInputs(db)
  if ((await getSetting(db, FEEDBACK_SOURCE_SETTING, '')) === inputs) return openCount(db)
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
  // Only what changed is written: every write wakes the live queries (the home page
  // recomputes the coach), and this runs each time the home page opens.
  const changed = fresh.filter((f) => {
    const old = existing.get(f.id)
    return !old || !sameItem(old, f)
  })
  const removed = [...existing.keys()].filter((id) => !keep.has(id))
  if (changed.length || removed.length)
    await db.transaction('rw', db.feedback, async () => {
      await db.feedback.bulkDelete(removed)
      await db.feedback.bulkPut(changed)
    })
  await setSetting(db, FEEDBACK_SOURCE_SETTING, inputs)
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
