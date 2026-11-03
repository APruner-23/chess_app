import { judgeMoves } from '../analysis/judgments'
import { MIN_BOOK_PLIES, userAccuracy } from '../feedback/stats'
import type { FeedbackItem } from '../feedback/types'
import type { Analysis, Game } from '../import/types'

export interface MonthRow {
  /** "2026-09" */
  month: string
  /** "set 26" */
  label: string
  games: number
  /** Points per game, 0…1 (undefined for a month without games). */
  score?: number
  /** Average accuracy of analyzed games. */
  accuracy?: number
  /** Mistakes and blunders per 100 moves of the user, analyzed games. */
  errorsPer100?: number
  /** Share of games lost on time. */
  timeLosses?: number
  /** Share of games that followed one of the user's repertoires. */
  inBook?: number
}

export type ProgressKey = 'score' | 'accuracy' | 'errorsPer100' | 'timeLosses' | 'inBook'

const monthKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number) as [number, number]
  return `${new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'short' })} ${String(y).slice(2)}`
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

/** The months from `first` to `last` included, as "YYYY-MM". */
function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number) as [number, number]
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= last) return out
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
}

/**
 * Month by month over the last `months` calendar months up to the latest game; months
 * without games are kept (empty), so the time axis is honest.
 */
export function monthlyProgress(
  games: readonly Game[],
  analyses: ReadonlyMap<string, Analysis>,
  exits: readonly FeedbackItem[],
  months = 18,
): MonthRow[] {
  const inBook = new Set(exits.filter((f) => f.bookPlies >= MIN_BOOK_PLIES).map((f) => f.gameId))
  const byMonth = new Map<string, Game[]>()
  for (const g of games) {
    const k = monthKey(g.playedAt)
    byMonth.set(k, [...(byMonth.get(k) ?? []), g])
  }
  const keys = [...byMonth.keys()].sort()
  if (keys.length === 0) return []
  return monthRange(keys[0]!, keys[keys.length - 1]!)
    .slice(-months)
    .map((month) => {
      const list = byMonth.get(month) ?? []
      if (list.length === 0) return { month, label: monthLabel(month), games: 0 }
      const accs: number[] = []
      let moves = 0
      let errors = 0
      for (const g of list) {
        const a = analyses.get(g.id)
        if (!a) continue
        const acc = userAccuracy(g, a)
        if (acc !== undefined) accs.push(acc)
        const parity = g.userColor === 'white' ? 0 : 1
        moves += a.plies.filter((_, i) => i % 2 === parity).length
        const judged =
          a.source === 'lichess' ? (p: number) => a.plies[p]!.best !== undefined : undefined
        errors += judgeMoves(
          a.plies.map((p) => p.eval),
          judged,
        ).filter((x) => x.ply % 2 === parity && x.judgment !== 'inaccuracy').length
      }
      const pts = list.reduce(
        (a, g) => a + (g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0),
        0,
      )
      const timeLosses = list.filter(
        (g) =>
          g.result === 'loss' && (g.termination === 'outoftime' || g.termination === 'timeout'),
      ).length
      const accuracy = avg(accs)
      return {
        month,
        label: monthLabel(month),
        games: list.length,
        score: pts / list.length,
        ...(accuracy !== undefined ? { accuracy } : {}),
        ...(moves ? { errorsPer100: (errors / moves) * 100 } : {}),
        timeLosses: timeLosses / list.length,
        inBook: list.filter((g) => inBook.has(g.id)).length / list.length,
      }
    })
}

/** Fewer games than this on either side make a trend noise. */
export const TREND_MIN_GAMES = 10

/**
 * The last `span` months against the `span` before them, weighted by games: undefined
 * unless both sides have at least TREND_MIN_GAMES games with a value.
 */
export function trend(
  rows: readonly MonthRow[],
  key: ProgressKey,
  span = 3,
): { recent: number; before: number } | undefined {
  const mean = (rs: readonly MonthRow[]) => {
    const withValue = rs.filter((r) => r[key] !== undefined)
    const n = withValue.reduce((a, r) => a + r.games, 0)
    return n >= TREND_MIN_GAMES
      ? withValue.reduce((a, r) => a + (r[key] as number) * r.games, 0) / n
      : undefined
  }
  const recent = mean(rows.slice(-span))
  const before = mean(rows.slice(-2 * span, -span))
  return recent !== undefined && before !== undefined ? { recent, before } : undefined
}

/** The month the user started training with the app, if known. */
export function startMonth(firstTraining?: number): string | undefined {
  return firstTraining === undefined ? undefined : monthKey(firstTraining)
}
