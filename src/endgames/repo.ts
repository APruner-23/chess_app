import type { ChessDb } from '../db/schema'
import { Rating, schedule } from '../training/fsrs'
import type { EndgameProgress } from './session'

/** Records the first attempt of an endgame exercise in a session. */
export async function recordEndgame(
  db: ChessDb,
  id: string,
  ok: boolean,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.endgameProgress, async () => {
    const cur = await db.endgameProgress.get(id)
    const next: EndgameProgress = {
      id,
      fsrs: schedule(cur?.fsrs, ok ? Rating.Good : Rating.Again, now),
      attempts: (cur?.attempts ?? 0) + 1,
      solved: (cur?.solved ?? 0) + (ok ? 1 : 0),
      lastCorrect: ok,
      introducedAt: cur?.introducedAt ?? now,
      updatedAt: now,
    }
    await db.endgameProgress.put(next)
  })
}
