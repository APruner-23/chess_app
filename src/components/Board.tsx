import { useEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
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
}

/** Read-only board built on Lichess' chessground. Interactive moves arrive in M3. */
export function Board({ fen, orientation = 'white', lastMove }: BoardProps) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)

  useEffect(() => {
    api.current = Chessground(el.current!, { viewOnly: true, coordinates: true })
    return () => api.current?.destroy()
  }, [])

  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined,
    })
  }, [fen, orientation, lastMove])

  return (
    <div className="aspect-square w-full">
      <div ref={el} className="h-full w-full" />
    </div>
  )
}
