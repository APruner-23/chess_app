import type { GamePosition } from '../db/schema'

export interface MyMoveStats {
  san: string
  games: number
  wins: number
  draws: number
  losses: number
}

/** "Le tue partite": what was played from a position in the user's games, most frequent first. */
export function myGamesMoves(rows: readonly GamePosition[]): MyMoveStats[] {
  const bySan = new Map<string, MyMoveStats>()
  for (const r of rows) {
    if (!r.san) continue
    const s = bySan.get(r.san) ?? { san: r.san, games: 0, wins: 0, draws: 0, losses: 0 }
    s.games++
    if (r.result === 'win') s.wins++
    else if (r.result === 'draw') s.draws++
    else s.losses++
    bySan.set(r.san, s)
  }
  return [...bySan.values()].sort((a, b) => b.games - a.games)
}
