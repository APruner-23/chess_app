import type { Color, Game, GameResult, Site, Speed } from './types'
import { openingFamily } from '../openings/classify'

export interface GameFilter {
  site?: Site
  color?: Color
  speed?: Speed
  result?: GameResult
  /** Matches the opening family or full name exactly, or a case-insensitive substring. */
  opening?: string
}

export function matchesOpening(game: Game, query: string): boolean {
  const name = game.openingName ?? 'Sconosciuta'
  if (name === query || openingFamily(name) === query) return true
  const q = query.toLowerCase()
  return name.toLowerCase().includes(q) || (game.eco?.toLowerCase() ?? '') === q
}

export function filterGames(games: readonly Game[], f: GameFilter): Game[] {
  return games.filter(
    (g) =>
      (!f.site || g.site === f.site) &&
      (!f.color || g.userColor === f.color) &&
      (!f.speed || g.speed === f.speed) &&
      (!f.result || g.result === f.result) &&
      (!f.opening || matchesOpening(g, f.opening)),
  )
}
