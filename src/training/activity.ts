/** Training done on one day on one device; devices are summed per day. */
export interface ActivityDay {
  /** `<YYYY-MM-DD>|<deviceId>` */
  id: string
  day: string
  reviews: number
  puzzles: number
  endgames: number
  updatedAt: number
}

export type ActivityKind = 'reviews' | 'puzzles' | 'endgames'

export const DEFAULT_DAILY_GOAL = 20

/** Local calendar day, e.g. "2026-11-03". */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Exercises done per day, all devices together. */
export function dailyTotals(days: readonly ActivityDay[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const d of days)
    totals.set(d.day, (totals.get(d.day) ?? 0) + d.reviews + d.puzzles + d.endgames)
  return totals
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Days in a row with the goal reached, up to today. Today still counts as pending: if it
 * is not reached yet, the streak is the one ending yesterday.
 */
export function goalStreak(totals: ReadonlyMap<string, number>, goal: number, now: number): number {
  let n = 0
  let t = now
  if ((totals.get(dayKey(t)) ?? 0) < goal) t -= DAY
  // Noon avoids skipping or repeating a day around daylight saving changes.
  const noon = new Date(t)
  noon.setHours(12, 0, 0, 0)
  for (let d = noon.getTime(); (totals.get(dayKey(d)) ?? 0) >= goal; d -= DAY) n++
  return n
}

/**
 * Calendar grid for the last `weeks` weeks: columns are weeks (oldest first), rows are
 * days from Monday; days after today are left out.
 */
export function calendarWeeks(
  totals: ReadonlyMap<string, number>,
  now: number,
  weeks = 20,
): { day: string; count: number }[][] {
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const start = today.getTime() - (mondayOffset + (weeks - 1) * 7) * DAY
  const cols: { day: string; count: number }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: { day: string; count: number }[] = []
    for (let i = 0; i < 7; i++) {
      const t = start + (w * 7 + i) * DAY
      if (t > today.getTime()) break
      const day = dayKey(t)
      col.push({ day, count: totals.get(day) ?? 0 })
    }
    cols.push(col)
  }
  return cols
}
