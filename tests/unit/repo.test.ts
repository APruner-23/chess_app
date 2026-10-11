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

describe('feedback storage', () => {
  it('keeps the user decision across reprocessing and drops stale items', async () => {
    const { processFeedback, ignore } = await import('../../src/feedback/repo')
    const { normalizeLichess } = await import('../../src/import/lichess')
    const { ndjsonLines } = await import('../helpers')
    const raw = ndjsonLines<import('../../src/import/lichess').LichessGame>(
      'lichess/malvoluto-recent.ndjson',
    )[0]!
    const { game } = normalizeLichess(raw, 'MalVoluto')!
    await db.games.put(game)
    const rep = await createRepertoire(db, {
      name: 'N',
      color: game.userColor,
      experimental: false,
    })
    await db.repertoires.update(rep.id, { createdAt: 0 })
    // The repertoire expects a different first opponent move: a hole on ply 0.
    await addLine(db, rep.id, INITIAL_EPD, [game.moves[0] === 'd4' ? 'e4' : 'd4'])
    expect(await processFeedback(db)).toBe(1)
    const hole = (await db.feedback.where('status').equals('open').toArray())[0]!
    expect(hole.kind).toBe('hole')
    await ignore(db, [hole])
    expect(await processFeedback(db)).toBe(0)
    expect((await db.feedback.get(hole.id))!.status).toBe('ignored')
    // Once the move is prepared, the hole disappears.
    await addLine(db, rep.id, INITIAL_EPD, [game.moves[0]!])
    await processFeedback(db)
    expect(await db.feedback.get(hole.id)).toBeUndefined()
  })
})
