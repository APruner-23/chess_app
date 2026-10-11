import { useEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { chessgroundDests } from 'chessops/compat'
import type { Api } from '@lichess-org/chessground/api'
import type { Key } from '@lichess-org/chessground/types'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

interface BoardProps {
  fen: string
  orientation?: 'white' | 'black'
  /** Last move in UCI ("e2e4"), highlighted on the board. */
  lastMove?: string
  /** Arrows to draw, as UCI moves (e.g. the engine's best move). */
  arrows?: string[]
  /** Makes the board playable for the side to move; receives the move in UCI. */
  onMove?: (uci: string) => void
}

/** Legal destinations for chessground, or undefined for an invalid FEN. */
function legalDests(fen: string) {
  const setup = parseFen(fen)
  if (setup.isErr) return undefined
  const pos = Chess.fromSetup(setup.value)
  return pos.isOk ? { dests: chessgroundDests(pos.value), turn: pos.value.turn } : undefined
}

/** Board built on Lichess' chessground: read-only, or playable when onMove is given. */
export function Board({ fen, orientation = 'white', lastMove, arrows, onMove }: BoardProps) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  })
  const playable = onMove !== undefined

  useEffect(() => {
    api.current = Chessground(el.current!, { coordinates: true })
    return () => api.current?.destroy()
  }, [])

  useEffect(() => {
    const legal = playable ? legalDests(fen) : undefined
    api.current?.set({
      fen,
      orientation,
      viewOnly: !playable,
      turnColor: legal?.turn,
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined,
      movable: {
        free: false,
        color: legal?.turn,
        dests: legal?.dests as Map<Key, Key[]> | undefined,
        showDests: true,
        events: {
          after: (orig, dest) => {
            // Auto-queen: underpromotions don't matter in an opening repertoire.
            const isPawn = api.current?.state.pieces.get(dest)?.role === 'pawn'
            const promo = isPawn && (dest[1] === '8' || dest[1] === '1') ? 'q' : ''
            onMoveRef.current?.(`${orig}${dest}${promo}`)
          },
        },
      },
    })
  }, [fen, orientation, lastMove, playable])

  const arrowKey = arrows?.join(',') ?? ''
  useEffect(() => {
    api.current?.setAutoShapes(
      arrowKey
        ? arrowKey.split(',').map((uci, i) => ({
            orig: uci.slice(0, 2) as Key,
            dest: uci.slice(2, 4) as Key,
            brush: i === 0 ? 'paleBlue' : 'paleGrey',
          }))
        : [],
    )
  }, [arrowKey, fen])

  return (
    <div className="aspect-square w-full">
      <div ref={el} className="h-full w-full" />
    </div>
  )
}
