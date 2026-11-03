import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { parseSan } from 'chessops/san'
import { attacks } from 'chessops/attacks'
import { opposite, parseUci, squareFile, squareRank } from 'chessops/util'
import type { Color, Role, Square } from 'chessops/types'
import type { Eval } from '../import/types'

/** The tactical theme of a puzzle: what the user missed, or what their move allowed. */
export type Motif =
  | 'mateMissed'
  | 'mateAllowed'
  | 'hanging'
  | 'missedCapture'
  | 'fork'
  | 'pin'
  | 'promotion'
  | 'endgame'
  | 'other'

export const MOTIF_LABELS: Record<Motif, string> = {
  mateMissed: 'Matto mancato',
  mateAllowed: 'Matto concesso',
  hanging: 'Pezzo lasciato in presa',
  missedCapture: 'Cattura mancata',
  fork: 'Forchetta',
  pin: 'Inchiodatura o infilata',
  promotion: 'Promozione',
  endgame: 'Tecnica nei finali',
  other: 'Posizionale',
}

/** A forced mate further than this is technique, not a missed tactic. */
const MATE_HORIZON = 5

/** One sentence on what to train, shown by the coach. */
export const MOTIF_ADVICE: Record<Motif, string> = {
  mateMissed: 'prima di ogni mossa cerca scacchi e catture che portano al matto',
  mateAllowed: 'controlla le minacce di matto al tuo re, soprattutto sulla traversa',
  hanging: 'prima di muovere, controlla che il pezzo arrivi su una casa difesa',
  missedCapture: "a ogni mossa dell'avversario chiediti: ha lasciato qualcosa in presa?",
  fork: 'cerca le case da cui un tuo pezzo attacca due bersagli insieme',
  pin: 'cerca pezzi allineati con il re o la donna avversaria',
  promotion: 'calcola le corse dei pedoni passati',
  endgame: 'ripassa i finali essenziali: re attivo, opposizione, torre dietro il pedone',
  other: 'rivedi i piani tipici delle tue aperture e dei finali',
}

const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 }

function position(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

/** Whether `color` attacks `square` (with the board as it is). */
const attackedBy = (pos: Chess, square: Square, color: Color) =>
  pos.kingAttackers(square, color, pos.board.occupied).nonEmpty()

/** Cheapest attacker of `color` on `square`, or undefined. */
function cheapestAttacker(pos: Chess, square: Square, color: Color): number | undefined {
  let best: number | undefined
  for (const sq of pos.kingAttackers(square, color, pos.board.occupied)) {
    const v = VALUE[pos.board.getRole(sq)!]
    if (best === undefined || v < best) best = v
  }
  return best
}

/** After the user's move: a piece of theirs (knight or more) that the opponent wins. */
function leavesHanging(after: Chess, user: Color): boolean {
  const opp = opposite(user)
  for (const sq of after.board[user]) {
    const role = after.board.getRole(sq)!
    if (role === 'king' || VALUE[role] < 3) continue
    const attacker = cheapestAttacker(after, sq, opp)
    if (attacker === undefined) continue
    if (!attackedBy(after, sq, user) || attacker < VALUE[role]) return true
  }
  return false
}

/** The solution takes a piece for free, or with a cheaper one. */
function winsMaterial(before: Chess, from: Square, to: Square): boolean {
  const victim = before.board.get(to)
  const mover = before.board.getRole(from)
  // Castling written king-takes-rook lands on the user's own rook.
  if (!victim || !mover || victim.color === before.turn || VALUE[victim.role] < 3) return false
  const occupied = before.board.occupied.without(from)
  const defended = before.kingAttackers(to, victim.color, occupied).nonEmpty()
  return !defended || VALUE[mover] < VALUE[victim.role]
}

/** Opposing pieces the piece on `sq` really threatens: the king, bigger or undefended ones. */
function targets(pos: Chess, sq: Square): Square[] {
  const piece = pos.board.get(sq)
  if (!piece) return [] // castling written king-takes-rook: nothing lands on `sq`
  const opp = opposite(piece.color)
  const out: Square[] = []
  for (const t of attacks(piece, sq, pos.board.occupied).intersect(pos.board[opp])) {
    const role = pos.board.getRole(t)!
    if (
      role === 'king' ||
      VALUE[role] > VALUE[piece.role] ||
      (VALUE[role] >= 3 && !attackedBy(pos, t, opp))
    )
      out.push(t)
  }
  return out
}

/** A slider hits a piece with something more valuable (or the king) behind it, or vice versa. */
function pinsOrSkewers(pos: Chess, sq: Square): boolean {
  const piece = pos.board.get(sq)
  if (!piece || (piece.role !== 'bishop' && piece.role !== 'rook' && piece.role !== 'queen'))
    return false
  const opp = opposite(piece.color)
  for (const t of attacks(piece, sq, pos.board.occupied).intersect(pos.board[opp])) {
    const df = Math.sign(squareFile(t) - squareFile(sq))
    const dr = Math.sign(squareRank(t) - squareRank(sq))
    let f = squareFile(t) + df
    let r = squareRank(t) + dr
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const behind = pos.board.get(r * 8 + f)
      if (behind) {
        const front = VALUE[pos.board.getRole(t)!]
        const back = VALUE[behind.role]
        if (behind.color === opp && (back > front || (front > back && back >= 3))) return true
        break
      }
      f += df
      r += dr
    }
  }
  return false
}

const mateFor = (e: Eval, color: Color) =>
  'mate' in e ? (color === 'white' ? e.mate : -e.mate) : undefined

/**
 * Classifies a puzzle. Checks run from the most specific to the least: a missed or
 * allowed mate, then a piece left hanging by the game move, then what the solution
 * does (wins material, forks, pins, promotes).
 */
export function classifyPuzzle(p: {
  fen: string
  solution: string
  played: string
  color: Color
  evalBefore: Eval
  evalAfter: Eval
  /** No tactic found in an endgame: technique rather than "positional". */
  endgame?: boolean
}): Motif {
  const before = position(p.fen)
  const move = parseUci(p.solution)
  if (!move || !('from' in move)) return 'other'

  const solved = before.clone()
  solved.play(move)
  const mateBefore = mateFor(p.evalBefore, p.color)
  if (
    solved.isCheckmate() ||
    (mateBefore !== undefined && mateBefore > 0 && mateBefore <= MATE_HORIZON)
  )
    return 'mateMissed'
  const mateAfter = mateFor(p.evalAfter, p.color)
  if (mateAfter !== undefined && mateAfter < 0) return 'mateAllowed'

  const played = parseSan(before, p.played)
  if (played) {
    const after = before.clone()
    after.play(played)
    if (leavesHanging(after, p.color)) return 'hanging'
  }
  // Taking on the same square with another piece is a recapture choice, not a missed capture.
  const sameTarget = played && 'from' in played && played.to === move.to
  if (!sameTarget && winsMaterial(before, move.from, move.to)) return 'missedCapture'
  if (targets(solved, move.to).length >= 2) return 'fork'
  if (pinsOrSkewers(solved, move.to)) return 'pin'
  if (move.promotion) return 'promotion'
  return p.endgame ? 'endgame' : 'other'
}
