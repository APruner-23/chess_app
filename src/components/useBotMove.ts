import { useEffect, useRef } from 'react'
import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { epdOf } from '../chess/position'
import { getSetting } from '../db/settings'
import { db } from '../db/schema'
import { engineQueue } from '../engine/instance'
import type { Color, Eval } from '../import/types'
import { DEFAULT_EXPLORER, type ExplorerResult } from '../lichess/explorer'
import { BOT_MULTI_PV, pickBookMove, pickBotMove, type BotLevel } from '../sparring/bot'
import { EXPLORER_KEY, explorer } from './lichessClient'

/** The bot never answers faster than this, so its moves can be followed. */
const MIN_THINK_MS = 500

export interface BotMoveInfo {
  /** Engine eval of the position the bot moved from (White's view), for engine moves. */
  eval?: Eval
  /** Set when the move came from the explorer: how often players of the level play it. */
  book?: { share: number }
}

function sanOf(fen: string, uci: string): string | undefined {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const move = parseUci(uci)
  return move && pos.isLegal(move) ? makeSan(pos, move) : undefined
}

/** How long the bot waits for Lichess before falling back to the engine. */
const BOOK_TIMEOUT_MS = 3000

/** Explorer statistics for the position: the cache first, then Lichess if connected. */
async function bookResult(fen: string): Promise<ExplorerResult | undefined> {
  const epd = epdOf(Chess.fromSetup(parseFen(fen).unwrap()).unwrap())
  const params = await getSetting(db, EXPLORER_KEY, DEFAULT_EXPLORER)
  return (
    (await explorer.peek('lichess', epd, params)) ??
    (await Promise.race([
      explorer.get('lichess', epd, params).catch(() => undefined),
      new Promise<undefined>((r) => setTimeout(r, BOOK_TIMEOUT_MS)),
    ]))
  )
}

/**
 * Plays the bot's move whenever `active`: from the explorer when `book` is on and the
 * position is common enough, else from the engine at `level`. Calls `onMove` with the SAN.
 */
export function useBotMove({
  fen,
  active,
  level,
  book,
  onMove,
}: {
  fen: string
  active: boolean
  level: BotLevel
  book?: boolean
  onMove: (san: string, info: BotMoveInfo) => void
}) {
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  })

  useEffect(() => {
    if (!active) return
    const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white'
    const started = performance.now()
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel = () => {}
    const play = (san: string, info: BotMoveInfo) => {
      const wait = Math.max(0, MIN_THINK_MS - (performance.now() - started))
      timer = setTimeout(() => live && onMoveRef.current(san, info), wait)
    }
    void (async () => {
      if (book) {
        const res = await bookResult(fen)
        const pick = res && pickBookMove(res.moves)
        const san = pick && sanOf(fen, pick.uci)
        if (!live) return
        if (san) return play(san, { book: { share: pick.share } })
      }
      const handle = engineQueue('live').submit(
        { fen, multiPv: BOT_MULTI_PV, nodes: level.nodes },
        'live',
      )
      cancel = handle.cancel
      const { lines, bestMove } = await handle.result.catch(() => ({
        lines: [],
        bestMove: undefined,
      }))
      if (!live) return
      const uci = pickBotMove(lines, turn, level) ?? bestMove
      const san = uci && sanOf(fen, uci)
      if (san) play(san, { ...(lines[0] ? { eval: lines[0].eval } : {}) })
    })()
    return () => {
      live = false
      clearTimeout(timer)
      cancel()
    }
  }, [active, fen, level, book])
}
