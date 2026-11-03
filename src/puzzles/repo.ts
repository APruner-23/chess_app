import type { ChessDb } from '../db/schema'
import { gradeAnswer, schedule } from '../training/fsrs'
import { extractPuzzles } from './extract'
import type { Puzzle, PuzzleProgress } from './types'

/** Re-derives the puzzle table from the analyzed games (local only, like an index). */
export async function rebuildPuzzles(db: ChessDb): Promise<number> {
  const analyses = await db.analyses.toArray()
  const games = await db.games.bulkGet(analyses.map((a) => a.id))
  const puzzles: Puzzle[] = []
  analyses.forEach((a, i) => {
    const g = games[i]
    if (g) puzzles.push(...extractPuzzles(g, a))
  })
  const keep = new Set(puzzles.map((p) => p.id))
  await db.transaction('rw', db.puzzles, async () => {
    const stale = (await db.puzzles.toCollection().primaryKeys()).filter((k) => !keep.has(k))
    await db.puzzles.bulkDelete(stale)
    await db.puzzles.bulkPut(puzzles)
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
