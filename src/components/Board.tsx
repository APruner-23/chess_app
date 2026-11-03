import { useEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { chessgroundDests } from 'chessops/compat'
import type { Api } from '@lichess-org/chessground/api'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

export interface Glyph {
  square: string
  color: string
  /** Text such as "?!" or "★", or raw SVG content in a 100×100 box. */
  text?: string
  svg?: string
}

/** The glyph's SVG: a disc overhanging the top-right corner of the square. */
function glyphHtml(g: Glyph): string {
  const inner =
    g.svg ??
    `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="${(g.text?.length ?? 1) > 1 ? 52 : 64}" font-weight="700" font-family="system-ui,sans-serif" fill="#fff">${g.text}</text>`
  return `<g transform="translate(71 -12) scale(0.4)"><circle cx="50" cy="50" r="50" fill="${g.color}" stroke="#1c1917" stroke-width="5"/>${inner}</g>`
}

interface BoardProps {
  fen: string
  orientation?: 'white' | 'black'
  /** Last move in UCI ("e2e4"), highlighted on the board. */
  lastMove?: string
  /** Arrows to draw, as UCI moves (e.g. the engine's best move). */
  arrows?: string[]
  /** A move annotation drawn in the corner of a square, like Lichess' glyphs. */
  glyph?: Glyph
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
export function Board({ fen, orientation = 'white', lastMove, arrows, glyph, onMove }: BoardProps) {
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

  // Applies the props to chessground. Kept in a ref so a move can re-sync the board:
  // chessground plays a move locally, but the page decides the position (a wrong
  // answer in training must snap back).
  const sync = useRef(() => {})
  useEffect(() => {
    sync.current = () => {
      const legal = playable ? legalDests(fen) : undefined
      const cg = api.current
      if (cg && cg.state.orientation !== orientation) {
        // A flip rebuilds the board element, and chessground binds its mouse/touch
        // listeners only if it is not view-only at that moment: flipping a read-only
        // board would leave it dead once it becomes playable. The listeners check
        // viewOnly on every event, so binding them always is safe.
        cg.state.viewOnly = false
        cg.set({ orientation })
      }
      cg?.set({
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
              setTimeout(() => sync.current(), 0)
            },
          },
        },
      })
    }
    sync.current()
  }, [fen, orientation, lastMove, playable])

  const arrowKey = arrows?.join(',') ?? ''
  const glyphKey = glyph ? `${glyph.square}|${glyphHtml(glyph)}` : ''
  useEffect(() => {
    const shapes: DrawShape[] = arrowKey
      ? arrowKey.split(',').map((uci, i) => ({
          orig: uci.slice(0, 2) as Key,
          dest: uci.slice(2, 4) as Key,
          brush: i === 0 ? 'paleBlue' : 'paleGrey',
        }))
      : []
    if (glyphKey) {
      const [square, html] = glyphKey.split(/\|(.*)/s) as [string, string]
      shapes.push({ orig: square as Key, customSvg: { html } })
    }
    api.current?.setAutoShapes(shapes)
  }, [arrowKey, glyphKey, fen])

  return (
    <div className="aspect-square w-full">
      <div ref={el} className="h-full w-full" />
    </div>
  )
}
