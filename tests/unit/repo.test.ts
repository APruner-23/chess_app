import { beforeEach, describe, expect, it } from 'vitest'
import { ChessDb } from '../../src/db/schema'
import { INITIAL_EPD } from '../../src/chess/position'
import {
  addLine,
  createRepertoire,
  deleteMove,
  deleteRepertoire,
  loadMoves,
  setMainMove,
  setNote,
} from '../../src/repertoire/repo'

let db: ChessDb
let n = 0
beforeEach(async () => {
  db = new ChessDb(`repo-${n++}`)
  await db.open()
})

describe('repertoire storage', () => {
  it('adds lines without duplicates and keeps the first move as main', async () => {
    const rep = await createRepertoire(db, { name: 'Bianco', color: 'white', experimental: false })
    expect(await addLine(db, rep.id, INITIAL_EPD, ['e4', 'e5', 'Nf3'])).toBe(3)
    expect(await addLine(db, rep.id, INITIAL_EPD, ['e4', 'c5', 'Nf3'])).toBe(2)
    const moves = await loadMoves(db, rep.id)
    expect(moves).toHaveLength(5)
    const replies = moves
      .filter((m) => m.san === 'e5' || m.san === 'c5')
      .sort((a, b) => a.order - b.order)
    expect(replies.map((m) => m.san)).toEqual(['e5', 'c5'])
  })

  it('deletes a move with the moves that depended on it', async () => {
    const rep = await createRepertoire(db, { name: 'B', color: 'white', experimental: true })
    await addLine(db, rep.id, INITIAL_EPD, ['e4', 'e5', 'Nf3', 'Nc6'])
    await addLine(db, rep.id, INITIAL_EPD, ['e4', 'c5'])
    const e5 = (await loadMoves(db, rep.id)).find((m) => m.san === 'e5')!
    await deleteMove(db, e5)
    expect((await loadMoves(db, rep.id)).map((m) => m.san).sort()).toEqual(['c5', 'e4'])
  })

  it('changes the main move and stores notes', async () => {
    const rep = await createRepertoire(db, { name: 'N', color: 'black', experimental: false })
    await addLine(db, rep.id, INITIAL_EPD, ['e4', 'c5'])
    await addLine(db, rep.id, INITIAL_EPD, ['e4', 'e6'])
    const e6 = (await loadMoves(db, rep.id)).find((m) => m.san === 'e6')!
    await setMainMove(db, e6)
    await setNote(db, e6, '  Francese solida ')
    const moves = await loadMoves(db, rep.id)
    expect(moves.find((m) => m.san === 'e6')).toMatchObject({ order: 0, note: 'Francese solida' })
    expect(moves.find((m) => m.san === 'c5')!.order).toBe(1)
    await deleteRepertoire(db, rep.id)
    expect(await db.repMoves.count()).toBe(0)
  })
})

describe('training storage', () => {
  it('syncs cards, introduces them and schedules reviews', async () => {
    const { syncAllCards, recordAnswer } = await import('../../src/training/repo')
    const rep = await createRepertoire(db, { name: 'B', color: 'white', experimental: false })
    await addLine(db, rep.id, INITIAL_EPD, ['e4', 'e5', 'Nf3'])
    await syncAllCards(db, 1000)
    const cards = await db.cards.toArray()
    expect(cards.map((c) => c.san).sort()).toEqual(['Nf3', 'e4'])

    const card = cards.find((c) => c.san === 'e4')!
    await recordAnswer(db, card, 'learn', false, 500, 2000)
    expect((await db.cards.get(card.id))!.fsrs).toBeUndefined()
    await recordAnswer(db, card, 'learn', true, 500, 3000)
    const learned = (await db.cards.get(card.id))!
    expect(learned.introducedAt).toBe(3000)
    await recordAnswer(db, learned, 'review', false, 500, learned.fsrs!.due)
    expect((await db.cards.get(card.id))!.fsrs!.lapses).toBeGreaterThanOrEqual(0)
    expect(await db.reviewLogs.count()).toBe(2)
    await recordAnswer(db, learned, 'practice', false, 500, 9000)
    expect(await db.reviewLogs.count()).toBe(2)

    await deleteRepertoire(db, rep.id)
    await syncAllCards(db, 10_000)
    expect(await db.cards.count()).toBe(0)
  })
})
