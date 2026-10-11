import type { Analysis, Color, Game, GameResult, ImportedGame, PlyEval, Speed } from './types'

/** The subset of the Lichess NDJSON game export we rely on. */
export interface LichessGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  createdAt: number
  status: string
  initialFen?: string
  players: Record<Color, LichessPlayer>
  winner?: Color
  moves: string
  clocks?: number[]
  clock?: { initial: number; increment: number }
  analysis?: { eval?: number; mate?: number; best?: string }[]
}

interface LichessPlayer {
  user?: { name: string; id: string }
  rating?: number
  analysis?: { accuracy?: number }
}

const UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])

const SPEEDS: Record<string, Speed> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
}

/** Builds the export URL; `since` is a createdAt timestamp in ms. */
export function lichessGamesUrl(username: string, since?: number): string {
  const params = new URLSearchParams({
    opening: 'true',
    evals: 'true',
    accuracy: 'true',
    clocks: 'true',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
  })
  if (since !== undefined) params.set('since', String(since))
  return `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`
}

/** Returns undefined for games we don't keep (variants, custom start, unfinished, not the user's). */
export function normalizeLichess(raw: LichessGame, username: string): ImportedGame | undefined {
  if (raw.variant !== 'standard' || raw.initialFen || UNFINISHED.has(raw.status)) return undefined
  const me = username.toLowerCase()
  const userColor: Color | undefined =
    raw.players.white.user?.id === me
      ? 'white'
      : raw.players.black.user?.id === me
        ? 'black'
        : undefined
  if (!userColor) return undefined
  const moves = raw.moves ? raw.moves.split(' ') : []
  if (moves.length === 0) return undefined

  const result: GameResult = !raw.winner ? 'draw' : raw.winner === userColor ? 'win' : 'loss'
  const id = `lichess:${raw.id}`
  const updatedAt = Date.now()
  const player = (c: Color) => ({
    name: raw.players[c].user?.name ?? 'Anonimo',
    rating: raw.players[c].rating,
  })
  const game: Game = {
    id,
    site: 'lichess',
    url: `https://lichess.org/${raw.id}${userColor === 'black' ? '/black' : ''}`,
    playedAt: raw.createdAt,
    speed: SPEEDS[raw.speed] ?? 'classical',
    timeControl: raw.clock ? `${raw.clock.initial}+${raw.clock.increment}` : '-',
    rated: raw.rated,
    userColor,
    result,
    termination: raw.status,
    white: player('white'),
    black: player('black'),
    moves,
    // On resign/timeout Lichess appends the clock of the side to move; drop it.
    ...(raw.clocks ? { clocks: raw.clocks.slice(0, moves.length) } : {}),
    updatedAt,
  }

  let analysis: Analysis | undefined
  if (raw.analysis?.length) {
    const plies: PlyEval[] = raw.analysis.map((a) => ({
      eval: a.mate !== undefined ? { mate: a.mate } : { cp: a.eval ?? 0 },
      ...(a.best ? { best: a.best } : {}),
    }))
    analysis = {
      id,
      source: 'lichess',
      plies,
      accuracy: {
        white: raw.players.white.analysis?.accuracy,
        black: raw.players.black.analysis?.accuracy,
      },
      updatedAt,
    }
  }
  return { game, analysis }
}

/** Parses an NDJSON response body line by line, as it streams in. */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) yield JSON.parse(line) as T
    }
    if (done) break
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T
}
