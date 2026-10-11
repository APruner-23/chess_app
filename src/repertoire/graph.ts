import { Chess, type Position } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { makeUci } from 'chessops'
import { INITIAL_EPD, epdOf } from '../chess/position'
import type { Color } from '../import/types'
import type { RepMove } from './types'

export function positionFromEpd(epd: string): Position {
  return Chess.fromSetup(parseFen(`${epd} 0 1`).unwrap()).unwrap()
}

export function turnOf(epd: string): Color {
  return epd.split(' ')[1] === 'b' ? 'black' : 'white'
}

export function moveId(repertoireId: string, fromEpd: string, uci: string): string {
  return `${repertoireId}|${fromEpd}|${uci}`
}

/** Builds the edge for `san` played from `fromEpd`, or undefined if illegal. */
export function makeRepMove(
  repertoireId: string,
  fromEpd: string,
  san: string,
  order: number,
  note?: string,
): RepMove | undefined {
  const pos = positionFromEpd(fromEpd)
  const move = parseSan(pos, san)
  if (!move) return undefined
  const canonical = makeSan(pos, move)
  const uci = makeUci(move)
  pos.play(move)
  return {
    id: moveId(repertoireId, fromEpd, uci),
    repertoireId,
    fromEpd,
    toEpd: epdOf(pos),
    uci,
    san: canonical,
    ...(note ? { note } : {}),
    order,
    updatedAt: Date.now(),
  }
}

/** Read-only view of a repertoire's moves, indexed by position. */
export class RepGraph {
  private byFrom = new Map<string, RepMove[]>()

  constructor(readonly moves: readonly RepMove[]) {
    for (const m of moves) {
      const list = this.byFrom.get(m.fromEpd) ?? []
      list.push(m)
      this.byFrom.set(m.fromEpd, list)
    }
    for (const list of this.byFrom.values()) list.sort((a, b) => a.order - b.order)
  }

  /** Moves from a position, main move first. */
  children(epd: string): RepMove[] {
    return this.byFrom.get(epd) ?? []
  }

  /** Positions where the user must answer, with their main move (future training cards). */
  userPositions(color: Color, root = INITIAL_EPD): { epd: string; move: RepMove }[] {
    return [...this.reachable(root).epds]
      .filter((epd) => turnOf(epd) === color && this.children(epd).length > 0)
      .map((epd) => ({ epd, move: this.children(epd)[0]! }))
  }

  /** Positions and moves reachable from the root (transpositions visited once). */
  reachable(root = INITIAL_EPD): { epds: Set<string>; moveIds: Set<string> } {
    const epds = new Set([root])
    const moveIds = new Set<string>()
    const stack = [root]
    while (stack.length) {
      for (const m of this.children(stack.pop()!)) {
        moveIds.add(m.id)
        if (!epds.has(m.toEpd)) {
          epds.add(m.toEpd)
          stack.push(m.toEpd)
        }
      }
    }
    return { epds, moveIds }
  }

  /** Moves no longer reachable from the root, e.g. after deleting the edge above them. */
  orphans(root = INITIAL_EPD): RepMove[] {
    const { moveIds } = this.reachable(root)
    return this.moves.filter((m) => !moveIds.has(m.id))
  }
}
