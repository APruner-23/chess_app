import type { Eval } from '../import/types'

export interface PvLine {
  /** 1-based MultiPV index. */
  multipv: number
  depth: number
  /** From White's point of view. */
  eval: Eval
  /** Principal variation in UCI. */
  pv: string[]
  nodes: number
}

/**
 * Parses an "info … score … pv …" line. Scores in UCI are from the side to move,
 * so they are flipped when Black is to move. Bound scores and lines without a pv are skipped.
 */
export function parseInfo(line: string, turn: 'white' | 'black'): PvLine | undefined {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return undefined
  const tokens = line.split(' ')
  const num = (key: string) => {
    const i = tokens.indexOf(key)
    return i >= 0 ? Number(tokens[i + 1]) : undefined
  }
  if (tokens.includes('lowerbound') || tokens.includes('upperbound')) return undefined
  const s = tokens.indexOf('score')
  if (s < 0) return undefined
  const kind = tokens[s + 1]
  const value = Number(tokens[s + 2])
  const sign = turn === 'white' ? 1 : -1
  const ev: Eval = kind === 'mate' ? { mate: sign * value } : { cp: sign * value }
  return {
    multipv: num('multipv') ?? 1,
    depth: num('depth') ?? 0,
    eval: ev,
    pv: tokens.slice(tokens.indexOf('pv') + 1).filter(Boolean),
    nodes: num('nodes') ?? 0,
  }
}

/** "bestmove e2e4 ponder e7e5" → "e2e4"; "(none)" → undefined. */
export function parseBestMove(line: string): string | undefined | null {
  if (!line.startsWith('bestmove')) return null
  const move = line.split(' ')[1]
  return move && move !== '(none)' ? move : undefined
}
