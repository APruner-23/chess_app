import type { Game } from '../import/types'
import { openingFamily } from './classify'

export type OpeningLevel = 'family' | 'variation'

export interface OpeningStats {
  /** Opening name at the requested level, or "Sconosciuta". */
  name: string
  /** ECO of the most common line in this group. */
  eco: string
  games: number
  wins: number
  draws: number
  losses: number
  /** Points per game in %, draws count half. */
  score: number
}

export const UNKNOWN_OPENING = 'Sconosciuta'

export function openingKey(game: Game, level: OpeningLevel): string {
  if (!game.openingName) return UNKNOWN_OPENING
  return level === 'family' ? openingFamily(game.openingName) : game.openingName
}

/** Win/draw/loss per opening, most played first. Filter games by color/speed beforehand. */
export function openingStats(games: readonly Game[], level: OpeningLevel): OpeningStats[] {
  const groups = new Map<string, { stats: OpeningStats; ecos: Map<string, number> }>()
  for (const game of games) {
    const name = openingKey(game, level)
    let group = groups.get(name)
    if (!group) {
      group = {
        stats: { name, eco: '', games: 0, wins: 0, draws: 0, losses: 0, score: 0 },
        ecos: new Map(),
      }
      groups.set(name, group)
    }
    const s = group.stats
    s.games++
    if (game.result === 'win') s.wins++
    else if (game.result === 'draw') s.draws++
    else s.losses++
    if (game.eco) group.ecos.set(game.eco, (group.ecos.get(game.eco) ?? 0) + 1)
  }
  return [...groups.values()]
    .map(({ stats, ecos }) => ({
      ...stats,
      eco: [...ecos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      score: Math.round(((stats.wins + stats.draws / 2) / stats.games) * 1000) / 10,
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}
