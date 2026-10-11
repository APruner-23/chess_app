import type { ChessDb } from './schema'

/** How far back the first import goes, in months; null means everything. */
export const IMPORT_MONTHS_KEY = 'importMonths'

export async function getSetting<T>(db: ChessDb, key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting<T>(db: ChessDb, key: string, value: T): Promise<void> {
  await db.settings.put({ key, value, updatedAt: Date.now() })
}
