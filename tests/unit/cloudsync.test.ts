import { beforeEach, describe, expect, it } from 'vitest'
import { handle, type Env } from '../../worker/index'
import { ChessDb } from '../../src/db/schema'
import { setSetting, getSetting } from '../../src/db/settings'
import { TOKEN_KEY } from '../../src/lichess/oauth'
import { INITIAL_EPD } from '../../src/chess/position'
import { addLine, createRepertoire, deleteMove, loadMoves } from '../../src/repertoire/repo'
import { normalizeLichess, type LichessGame } from '../../src/import/lichess'
import { syncNow, SyncError, SYNC_KEY_SETTING } from '../../src/sync/sync'
import { fakeD1 } from '../d1'
import { ndjsonLines } from '../helpers'

let env: Env
let n = 0
const device = async () => {
  const db = new ChessDb(`sync-${n++}`)
  await db.open()
  return db
}
/** Routes the client's fetch straight into the Worker. */
const viaWorker: typeof fetch = (input, init) =>
  handle(new Request(new URL(String(input), 'https://app.test'), init), env)
const sync = (db: ChessDb, key = 'secret') => syncNow(db, { key, fetch: viaWorker })

beforeEach(() => {
  env = { DB: fakeD1(), SYNC_KEY: 'secret' }
})

describe('sync Worker', () => {
  it('rejects a wrong key and reports a missing configuration', async () => {
    const res = await handle(
      new Request('https://app.test/api/ping', { headers: { Authorization: 'Bearer nope' } }),
      env,
    )
    expect(res.status).toBe(401)
    const unset = await handle(new Request('https://app.test/api/ping'), { DB: env.DB })
    expect(unset.status).toBe(503)
    const a = await device()
    await expect(sync(a, 'nope')).rejects.toBeInstanceOf(SyncError)
  })

  it('keeps the newer copy and pages through results', async () => {
    const post = (since: number, body: unknown) =>
      handle(
        new Request(`https://app.test/api/sync?since=${since}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer secret' },
          body: JSON.stringify(body),
        }),
        env,
      ).then(
        (r) =>
          r.json() as Promise<{
            changes: { id: string; data: { v: number } }[]
            cursor: number
            more: boolean
          }>,
      )
    await post(0, [{ tbl: 'games', id: 'g', updatedAt: 10, data: { id: 'g', v: 1 } }])
    await post(0, [{ tbl: 'games', id: 'g', updatedAt: 5, data: { id: 'g', v: 0 } }]) // older: ignored
    const page = await post(0, [])
    expect(page.changes).toEqual([expect.objectContaining({ id: 'g', data: { id: 'g', v: 1 } })])

    const many = Array.from({ length: 140 }, (_, i) => ({
      tbl: 'games',
      id: `x${i}`,
      updatedAt: 20,
      data: { id: `x${i}` },
    }))
    await post(0, many)
    await post(
      0,
      many.map((c) => ({ ...c, id: `y${c.id}`, data: { id: `y${c.id}` } })),
    )
    await post(
      0,
      many.map((c) => ({ ...c, id: `z${c.id}`, data: { id: `z${c.id}` } })),
    )
    let cursor = 0
    const ids = new Set<string>()
    for (let more = true; more;) {
      const p = await post(cursor, [])
      p.changes.forEach((c) => ids.add(c.id))
      cursor = p.cursor
      more = p.more
    }
    expect(ids.size).toBe(1 + 3 * 140)
  })
})

describe('two devices', () => {
  const raw = ndjsonLines<LichessGame>('lichess/malvoluto-recent.ndjson')

  it('brings games, repertoires and settings across, but not device secrets', async () => {
    const pc = await device()
    const phone = await device()
    for (const r of raw.slice(0, 5)) await pc.games.put(normalizeLichess(r, 'MalVoluto')!.game)
    const rep = await createRepertoire(pc, { name: 'Bianco', color: 'white', experimental: false })
    await addLine(pc, rep.id, INITIAL_EPD, ['e4', 'e5', 'Nf3'])
    await setSetting(pc, 'newCardsPerDay', 7)
    await setSetting(pc, TOKEN_KEY, 'lio_secret')
    await setSetting(pc, SYNC_KEY_SETTING, 'secret')

    expect((await sync(pc)).pushed).toBeGreaterThan(5)
    await sync(phone)
    expect(await phone.games.count()).toBe(5)
    expect(await phone.gamePositions.count()).toBeGreaterThan(20)
    expect((await loadMoves(phone, rep.id)).map((m) => m.san).sort()).toEqual(['Nf3', 'e4', 'e5'])
    expect(await getSetting(phone, 'newCardsPerDay', 0)).toBe(7)
    expect(await phone.settings.get(TOKEN_KEY)).toBeUndefined()
    expect(await phone.settings.get(SYNC_KEY_SETTING)).toBeUndefined()
  })

  it('propagates edits and deletions both ways, newest edit winning', async () => {
    const pc = await device()
    const phone = await device()
    const rep = await createRepertoire(pc, { name: 'R', color: 'white', experimental: false })
    await addLine(pc, rep.id, INITIAL_EPD, ['e4', 'e5', 'Nf3', 'Nc6'])
    await sync(pc)
    await sync(phone)

    // The phone deletes 2...Nf3 (and what follows); the PC renames the repertoire later.
    const nf3 = (await loadMoves(phone, rep.id)).find((m) => m.san === 'Nf3')!
    await deleteMove(phone, nf3)
    await new Promise((r) => setTimeout(r, 5))
    await pc.repertoires.update(rep.id, { name: 'Spagnola', updatedAt: Date.now() })
    await sync(phone)
    await sync(pc)
    await sync(phone)

    for (const db of [pc, phone]) {
      expect((await loadMoves(db, rep.id)).map((m) => m.san).sort()).toEqual(['e4', 'e5'])
      expect((await db.repertoires.get(rep.id))!.name).toBe('Spagnola')
    }
  })

  it('does not resend what it just pulled', async () => {
    const pc = await device()
    const phone = await device()
    for (const r of raw.slice(0, 3)) await pc.games.put(normalizeLichess(r, 'MalVoluto')!.game)
    await sync(pc)
    await sync(phone)
    const again = await sync(phone)
    expect(again.pushed).toBe(0)
    expect(again.pulled).toBe(0)
  })
})

describe('two devices: training progress', () => {
  it('shares puzzle, endgame and daily-goal progress; keeps derived and per-device data local', async () => {
    const { recordPuzzle, refreshDerived } = await import('../../src/puzzles/repo')
    const { recordEndgame } = await import('../../src/endgames/repo')
    const { recordActivity } = await import('../../src/training/activityRepo')
    const { dailyTotals } = await import('../../src/training/activity')
    const { DEVICE_ID_SETTING, PUZZLE_SOURCES_SETTING, FEEDBACK_SOURCE_SETTING } =
      await import('../../src/sync/sync')
    const { processFeedback } = await import('../../src/feedback/repo')
    const phone = await device()
    const laptop = await device()
    const raw = ndjsonLines<LichessGame>('lichess/malvoluto-analysed.ndjson')[0]!
    const { game, analysis } = normalizeLichess(raw, 'MalVoluto')!
    await laptop.games.put(game)
    await laptop.analyses.put(analysis!)
    await refreshDerived(laptop)
    await processFeedback(laptop)
    const puzzle = (await laptop.puzzles.toArray())[0]!
    const today = new Date(2026, 10, 3, 12).getTime()

    // Both devices train on the same day.
    await recordPuzzle(laptop, puzzle.id, true, 3000, today)
    await recordEndgame(laptop, 'mate-rook', false, today)
    await recordActivity(laptop, 'puzzles', today)
    await recordActivity(laptop, 'endgames', today)
    await recordActivity(phone, 'reviews', today)
    await recordActivity(phone, 'reviews', today)
    await recordActivity(phone, 'reviews', today)

    await sync(laptop)
    await sync(phone)
    await sync(laptop)

    for (const db of [phone, laptop]) {
      expect((await db.puzzleProgress.get(puzzle.id))?.lastCorrect).toBe(true)
      expect((await db.endgameProgress.get('mate-rook'))?.lastCorrect).toBe(false)
      // One row per device, summed per day: nothing overwritten.
      const rows = await db.activity.toArray()
      expect(rows).toHaveLength(2)
      expect(dailyTotals(rows).get('2026-11-03')).toBe(5)
    }
    // Derived tables and device-only markers never travel.
    expect(await phone.puzzles.count()).toBe(0)
    expect(await phone.gameFacts.count()).toBe(0)
    expect(await phone.analyses.count()).toBe(1) // the analysis itself does travel
    expect(await getSetting(phone, PUZZLE_SOURCES_SETTING, null)).toBeNull()
    expect(await getSetting(phone, FEEDBACK_SOURCE_SETTING, null)).toBeNull()
    expect(await getSetting(phone, DEVICE_ID_SETTING, '')).not.toBe(
      await getSetting(laptop, DEVICE_ID_SETTING, ''),
    )
    // The phone derives its own puzzles from the synced analysis.
    await refreshDerived(phone)
    expect(await phone.puzzles.count()).toBe(await laptop.puzzles.count())
  })
})
