import { Chess, type Position } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { makeUci, type NormalMove } from 'chessops'

/**
 * Normalized EPD: board, turn, castling, and the en-passant square only when an
 * en-passant capture is actually legal (chessops' toSetup() already does that).
 * Transpositions therefore map to the same key.
 */
export function epdOf(pos: Position): string {
  return makeFen(pos.toSetup(), { epd: true })
}

export const INITIAL_EPD = epdOf(Chess.default())

export interface Replay {
  /** epds[i] is the position before ply i; epds[sans.length] is the final position. */
  epds: string[]
  /** UCI of each ply, used to highlight the last move on the board. */
  ucis: string[]
  /** FEN of each position, same indexing as epds (needed by the board). */
  fens: string[]
}

/** Replays SAN moves from the standard start. Throws on an illegal move. */
export function replaySan(sans: readonly string[]): Replay {
  const pos = Chess.default()
  const epds = [epdOf(pos)]
  const fens = [makeFen(pos.toSetup())]
  const ucis: string[] = []
  for (const san of sans) {
    const move = parseSan(pos, san)
    if (!move) throw new Error(`Illegal move ${san} at ply ${ucis.length + 1}`)
    ucis.push(makeUci(move))
    pos.play(move)
    epds.push(epdOf(pos))
    fens.push(makeFen(pos.toSetup()))
  }
  return { epds, ucis, fens }
}

/** Re-renders SAN in canonical chessops form (e.g. strips annotations like "!?"). */
export function canonicalSan(pos: Position, san: string): string | undefined {
  const move = parseSan(pos, san) as NormalMove | undefined
  return move ? makeSan(pos, move) : undefined
}
