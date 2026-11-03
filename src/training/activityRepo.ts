import type { ChessDb } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { DEVICE_ID_SETTING } from '../sync/sync'
import { dayKey, type ActivityDay, type ActivityKind } from './activity'

export const DAILY_GOAL_KEY = 'dailyGoal'

/** A random id for this device, kept local: each device writes its own activity rows. */
async function deviceId(db: ChessDb): Promise<string> {
  let id = await getSetting(db, DEVICE_ID_SETTING, '')
  if (!id) {
    id = Math.random().toString(36).slice(2, 10)
    await setSetting(db, DEVICE_ID_SETTING, id)
  }
  return id
}

/** Counts one exercise done now (a review, a puzzle or an endgame). */
export async function recordActivity(db: ChessDb, kind: ActivityKind, now = Date.now()) {
  const day = dayKey(now)
  const id = `${day}|${await deviceId(db)}`
  await db.transaction('rw', db.activity, async () => {
    const cur: ActivityDay = (await db.activity.get(id)) ?? {
      id,
      day,
      reviews: 0,
      puzzles: 0,
      endgames: 0,
      updatedAt: now,
    }
    await db.activity.put({ ...cur, [kind]: cur[kind] + 1, updatedAt: now })
  })
}
