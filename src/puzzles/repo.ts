import { factsOf, type GameFacts } from '../analysis/facts'
import type { ChessDb } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { PUZZLE_SOURCES_SETTING } from '../sync/sync'
import { gradeAnswer, schedule } from '../training/fsrs'
import { extractPuzzles } from './extract'
import type { Puzzle, PuzzleProgress } from './types'

/**
 * Bumped when puzzle extraction or classification changes: every puzzle is then
 * derived again on each device.
 */
export const PUZZLE_VERSION = 3

interface Sources {
  version: number
  /** Analysis id → its updatedAt when its puzzles were derived. */
  done: Record<string, number>
}

/**
 * Keeps the tables derived from analyses (puzzles and per-game facts) in line with
 * them, incrementally: only analyses that are new or changed since the last run are
 * processed (the first run, or a new PUZZLE_VERSION, processes them all). Writes
 * nothing when nothing changed.
 */
export async function refreshDerived(db: ChessDb): Promise<number> {
  const stored = await getSetting<Sources | null>(db, PUZZLE_SOURCES_SETTING, null)
  const done = stored?.version === PUZZLE_VERSION ? stored.done : {}
  // Same index walk twice: ids and updatedAt come in the same order, without the records.
  const byUpdate = db.analyses.orderBy('updatedAt')
  const [ids, stamps] = await Promise.all([byUpdate.primaryKeys(), byUpdate.keys()])
  const current = new Map(ids.map((id, i) => [id, stamps[i] as number]))
  const todo = ids.filter((id) => done[id] !== current.get(id))
  const gone = Object.keys(done).filter((id) => !current.has(id))
  const fresh = stored?.version !== PUZZLE_VERSION
  if (!todo.length && !gone.length && !fresh) return 0

  const analyses = await db.analyses.bulkGet(todo)
  const games = await db.games.bulkGet(todo)
  const puzzles: Puzzle[] = []
  const facts: GameFacts[] = []
  analyses.forEach((a, i) => {
    const g = games[i]
    if (!a || !g) return
    puzzles.push(...extractPuzzles(g, a))
    facts.push(factsOf(g, a))
  })
  await db.transaction('rw', [db.puzzles, db.gameFacts, db.settings], async () => {
    if (fresh) {
      await db.puzzles.clear()
      await db.gameFacts.clear()
    } else {
      await db.puzzles
        .where('gameId')
        .anyOf([...todo, ...gone])
        .delete()
      await db.gameFacts.bulkDelete(gone)
    }
    await db.puzzles.bulkPut(puzzles)
    await db.gameFacts.bulkPut(facts)
    await setSetting<Sources>(db, PUZZLE_SOURCES_SETTING, {
      version: PUZZLE_VERSION,
      done: Object.fromEntries(current),
    })
  })
  return puzzles.length
}

/** Records the first attempt of a scheduled puzzle. */
export async function recordPuzzle(
  db: ChessDb,
  puzzleId: string,
  correct: boolean,
  elapsedMs: number,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.puzzleProgress, async () => {
    const cur = await db.puzzleProgress.get(puzzleId)
    const next: PuzzleProgress = {
      id: puzzleId,
      fsrs: schedule(cur?.fsrs, gradeAnswer(correct, elapsedMs), now),
      attempts: (cur?.attempts ?? 0) + 1,
      solved: (cur?.solved ?? 0) + (correct ? 1 : 0),
      lastCorrect: correct,
      introducedAt: cur?.introducedAt ?? now,
      updatedAt: now,
    }
    await db.puzzleProgress.put(next)
  })
}
