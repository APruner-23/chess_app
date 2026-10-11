import { beforeEach, describe, expect, it } from 'vitest'
import { ChessDb } from '../../src/db/schema'
import { exportBackup, importBackup } from '../../src/db/backup'
import { setSetting } from '../../src/db/settings'
import { TOKEN_KEY } from '../../src/lichess/oauth'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { createRepertoire, addLine } from '../../src/repertoire/repo'
import { INITIAL_EPD } from '../../src/chess/position'
import { ndjsonLines } from '../helpers'

let n = 0
const fresh = async () => {
  const db = new ChessDb(`backup-${n++}`)
  await db.open()
  return db
}

describe('JSON backup', () => {
  let src: ChessDb
  beforeEach(async () => {
    src = await fresh()
    const raw = ndjsonLines<LichessGame>('lichess/malvoluto-recent.ndjson')[0]!
    await src.games.put(normalizeLichess(raw, 'MalVoluto')!.game)
    const rep = await createRepertoire(src, { name: 'R', color: 'white', experimental: false })
    await addLine(src, rep.id, INITIAL_EPD, ['e4', 'e5'])
    await setSetting(src, TOKEN_KEY, 'lio_secret')
    await setSetting(src, 'newCardsPerDay', 5)
  })

  it('exports user data without the Lichess token or caches', async () => {
    const backup = await exportBackup(src)
    expect(JSON.stringify(backup)).not.toContain('lio_secret')
    expect(backup.tables.games).toHaveLength(1)
    expect(backup.tables.repMoves).toHaveLength(2)
    expect(Object.keys(backup.tables)).not.toContain('explorerCache')
    expect(Object.keys(backup.tables)).not.toContain('gamePositions')
  })

  it('restores into an empty database and rebuilds the position index', async () => {
    const backup = JSON.parse(JSON.stringify(await exportBackup(src)))
    const dst = await fresh()
    const report = await importBackup(dst, backup)
    expect(report.added).toBeGreaterThan(3)
    expect(await dst.repMoves.count()).toBe(2)
    expect(await dst.gamePositions.count()).toBeGreaterThan(10)
    expect(await dst.settings.get(TOKEN_KEY)).toBeUndefined()
  })

  it('merges by updatedAt: newer records win, older ones are skipped', async () => {
    const backup = await exportBackup(src)
    const dst = await fresh()
    await importBackup(dst, backup)
    await setSetting(dst, 'newCardsPerDay', 20) // newer local change
    const older = {
      ...backup,
      tables: { ...backup.tables, settings: [{ key: 'newCardsPerDay', value: 1, updatedAt: 1 }] },
    }
    const report = await importBackup(dst, older)
    expect((await dst.settings.get('newCardsPerDay'))!.value).toBe(20)
    expect(report.updated).toBe(0)
    await expect(importBackup(dst, { app: 'x' } as never)).rejects.toThrow(/non è un backup/)
  })
})
