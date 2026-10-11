import type { ChessDb } from '../db/schema'
import { RepGraph, makeRepMove } from './graph'
import type { RepMove, Repertoire } from './types'

export async function loadMoves(db: ChessDb, repertoireId: string): Promise<RepMove[]> {
  return db.repMoves.where('repertoireId').equals(repertoireId).toArray()
}

async function touch(db: ChessDb, repertoireId: string) {
  await db.repertoires.update(repertoireId, { updatedAt: Date.now() })
}

export async function createRepertoire(
  db: ChessDb,
  fields: Pick<Repertoire, 'name' | 'color' | 'experimental'>,
): Promise<Repertoire> {
  const now = Date.now()
  const rep: Repertoire = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now }
  await db.repertoires.add(rep)
  return rep
}

export async function deleteRepertoire(db: ChessDb, repertoireId: string) {
  await db.transaction('rw', db.repertoires, db.repMoves, async () => {
    await db.repMoves.where('repertoireId').equals(repertoireId).delete()
    await db.repertoires.delete(repertoireId)
  })
}

/**
 * Adds a line (SAN moves from fromEpd). Moves already in the repertoire are kept;
 * new ones become alternatives after the existing moves of their position.
 */
export async function addLine(
  db: ChessDb,
  repertoireId: string,
  fromEpd: string,
  sans: readonly string[],
): Promise<number> {
  return db.transaction('rw', db.repMoves, db.repertoires, async () => {
    let epd = fromEpd
    let added = 0
    for (const san of sans) {
      const siblings = await db.repMoves.where({ repertoireId, fromEpd: epd }).toArray()
      const move = makeRepMove(repertoireId, epd, san, siblings.length)
      if (!move) break
      if (!siblings.some((s) => s.id === move.id)) {
        await db.repMoves.add(move)
        added++
      }
      epd = move.toEpd
    }
    if (added) await touch(db, repertoireId)
    return added
  })
}

/** Merges imported moves; existing moves (and their notes) win. */
export async function mergeMoves(
  db: ChessDb,
  repertoireId: string,
  moves: RepMove[],
): Promise<number> {
  return db.transaction('rw', db.repMoves, db.repertoires, async () => {
    const existing = new Set(
      await db.repMoves.where('repertoireId').equals(repertoireId).primaryKeys(),
    )
    const fresh = moves.filter((m) => !existing.has(m.id))
    await db.repMoves.bulkAdd(fresh)
    await touch(db, repertoireId)
    return fresh.length
  })
}

/** Deletes a move and everything that is no longer reachable without it. */
export async function deleteMove(db: ChessDb, move: RepMove): Promise<void> {
  await db.transaction('rw', db.repMoves, db.repertoires, async () => {
    await db.repMoves.delete(move.id)
    const graph = new RepGraph(await loadMoves(db, move.repertoireId))
    await db.repMoves.bulkDelete(graph.orphans().map((m) => m.id))
    await touch(db, move.repertoireId)
  })
}

/** Makes `move` the main move of its position (order 0), keeping the others' order. */
export async function setMainMove(db: ChessDb, move: RepMove): Promise<void> {
  await db.transaction('rw', db.repMoves, db.repertoires, async () => {
    const siblings = await db.repMoves
      .where({ repertoireId: move.repertoireId, fromEpd: move.fromEpd })
      .sortBy('order')
    const ordered = [move, ...siblings.filter((s) => s.id !== move.id)]
    const now = Date.now()
    await db.repMoves.bulkPut(ordered.map((m, order) => ({ ...m, order, updatedAt: now })))
    await touch(db, move.repertoireId)
  })
}

export async function setNote(db: ChessDb, move: RepMove, note: string): Promise<void> {
  const trimmed = note.trim()
  await db.repMoves.update(move.id, { note: trimmed || undefined, updatedAt: Date.now() })
}
