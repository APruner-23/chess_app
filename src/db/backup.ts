import type { ChessDb } from './schema'
import { TOKEN_KEY } from '../lichess/oauth'
import { replaySan } from '../chess/position'
import { gamePositions } from '../import/positions'
import type { Game } from '../import/types'

/** User data that goes into a backup. Caches and indexes are rebuilt instead. */
export const BACKUP_TABLES = [
  'accounts',
  'games',
  'analyses',
  'repertoires',
  'repMoves',
  'cards',
  'reviewLogs',
  'feedback',
  'settings',
] as const
type BackupTable = (typeof BACKUP_TABLES)[number]

/** Never leaves the device. */
const PRIVATE_SETTINGS = new Set([TOKEN_KEY])

export interface Backup {
  app: 'chess_app'
  version: 1
  exportedAt: number
  tables: Partial<Record<BackupTable, Record<string, unknown>[]>>
}

const keyOf = (table: BackupTable, row: Record<string, unknown>) =>
  String(table === 'settings' ? row.key : row.id)

export async function exportBackup(db: ChessDb, now = Date.now()): Promise<Backup> {
  const tables: Backup['tables'] = {}
  for (const name of BACKUP_TABLES) {
    let rows = (await db.table(name).toArray()) as Record<string, unknown>[]
    if (name === 'settings') rows = rows.filter((r) => !PRIVATE_SETTINGS.has(String(r.key)))
    tables[name] = rows
  }
  return { app: 'chess_app', version: 1, exportedAt: now, tables }
}

export interface RestoreReport {
  added: number
  updated: number
  skipped: number
}

/**
 * Merges a backup into the database: a record replaces the local one only if it is
 * newer (updatedAt). Game positions are re-indexed for the games that came in.
 */
export async function importBackup(db: ChessDb, backup: Backup): Promise<RestoreReport> {
  if (backup?.app !== 'chess_app' || backup.version !== 1)
    throw new Error('Questo file non è un backup di chess_app.')
  const report: RestoreReport = { added: 0, updated: 0, skipped: 0 }
  const newGames: Game[] = []
  const tables = BACKUP_TABLES.map((n) => db.table(n))
  await db.transaction('rw', [...tables, db.gamePositions], async () => {
    for (const name of BACKUP_TABLES) {
      const rows = (backup.tables[name] ?? []).filter(
        (r) => !(name === 'settings' && PRIVATE_SETTINGS.has(String(r.key))),
      )
      const table = db.table(name)
      const local = new Map(
        (
          (await table.bulkGet(rows.map((r) => keyOf(name, r)))) as (
            Record<string, unknown> | undefined
          )[]
        ).map((r, i) => [keyOf(name, rows[i]!), r]),
      )
      const put = rows.filter((r) => {
        const mine = local.get(keyOf(name, r))
        if (!mine) {
          report.added++
          return true
        }
        if (Number(r.updatedAt ?? 0) > Number(mine.updatedAt ?? 0)) {
          report.updated++
          return true
        }
        report.skipped++
        return false
      })
      await table.bulkPut(put)
      if (name === 'games') newGames.push(...(put as unknown as Game[]))
    }
    for (const game of newGames) {
      try {
        await db.gamePositions.bulkPut(gamePositions(game, replaySan(game.moves).epds))
      } catch {
        // a corrupt game in the file: keep it, without the position index
      }
    }
  })
  return report
}
