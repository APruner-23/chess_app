import { describe, expect, it } from 'vitest'
import { calendarWeeks, dailyTotals, dayKey, goalStreak } from '../../src/training/activity'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15).getTime()

describe('activity', () => {
  it('sums devices per day', () => {
    const totals = dailyTotals([
      { id: 'a', day: '2026-11-03', reviews: 5, puzzles: 2, endgames: 0, updatedAt: 0 },
      { id: 'b', day: '2026-11-03', reviews: 1, puzzles: 0, endgames: 1, updatedAt: 0 },
    ])
    expect(totals.get('2026-11-03')).toBe(9)
    expect(dayKey(day(2026, 1, 5))).toBe('2026-01-05')
  })

  it('counts the streak up to today, or up to yesterday while today is pending', () => {
    const totals = new Map([
      ['2026-11-01', 20],
      ['2026-11-02', 25],
      ['2026-11-03', 5],
      ['2026-10-30', 30],
    ])
    expect(goalStreak(totals, 20, day(2026, 11, 3))).toBe(2)
    totals.set('2026-11-03', 20)
    expect(goalStreak(totals, 20, day(2026, 11, 3))).toBe(3)
    expect(goalStreak(totals, 20, day(2026, 11, 5))).toBe(0)
  })

  it('lays out weeks from Monday, without future days', () => {
    // 2026-11-03 is a Tuesday.
    const weeks = calendarWeeks(new Map([['2026-11-03', 4]]), day(2026, 11, 3), 3)
    expect(weeks).toHaveLength(3)
    expect(weeks[0]![0]!.day).toBe('2026-10-19')
    expect(weeks[2]!.map((d) => d.day)).toEqual(['2026-11-02', '2026-11-03'])
    expect(weeks[2]![1]!.count).toBe(4)
  })
})

describe('activity records', () => {
  it('counts exercises per day on this device, and keeps the device id local', async () => {
    const { ChessDb } = await import('../../src/db/schema')
    const { recordActivity } = await import('../../src/training/activityRepo')
    const { DEVICE_SETTINGS, DEVICE_ID_SETTING } = await import('../../src/sync/sync')
    const db = new ChessDb('activity-test')
    const now = day(2026, 11, 3)
    await recordActivity(db, 'reviews', now)
    await recordActivity(db, 'reviews', now)
    await recordActivity(db, 'puzzles', now)
    await recordActivity(db, 'endgames', day(2026, 11, 4))
    const rows = await db.activity.toArray()
    expect(rows).toHaveLength(2)
    expect(dailyTotals(rows).get('2026-11-03')).toBe(3)
    expect(new Set(rows.map((r) => r.id.split('|')[1])).size).toBe(1)
    expect(DEVICE_SETTINGS.has(DEVICE_ID_SETTING)).toBe(true)
    db.close()
  })
})
