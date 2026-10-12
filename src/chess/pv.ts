import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSanAndPlay } from 'chessops/san'
import { parseUci } from 'chessops'

/** The first moves of a PV in SAN, each with its move number label ("12." / "12…" / ""). */
export function pvMoves(fen: string, pv: readonly string[], max = 10) {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const out: { san: string; label: string }[] = []
  for (const [i, uci] of pv.slice(0, max).entries()) {
    const move = parseUci(uci)
    if (!move || !pos.isLegal(move)) break
    const white = pos.turn === 'white'
    const label = white ? `${pos.fullmoves}.` : i === 0 ? `${pos.fullmoves}…` : ''
    out.push({ san: makeSanAndPlay(pos, move), label })
  }
  return out
}
