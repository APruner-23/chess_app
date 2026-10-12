import type { GameResult, Speed } from '../import/types'

export const SPEED_LABELS: Record<Speed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classica',
  daily: 'Daily',
}

export const RESULT_LABELS: Record<GameResult, string> = {
  win: 'Vinta',
  draw: 'Patta',
  loss: 'Persa',
}

export const RESULT_COLORS: Record<GameResult, string> = {
  win: 'text-emerald-400',
  draw: 'text-stone-300',
  loss: 'text-red-400',
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const FRACTIONS: Record<number, string> = { 15: '¼', 30: '½', 45: '¾' }

/** "180+2" (seconds) → "3+2" (minutes + seconds of increment); daily "1/86400" → "1 g". */
export function formatTimeControl(tc: string): string {
  const daily = /^1\/(\d+)$/.exec(tc)
  if (daily) return `${Math.round(Number(daily[1]) / 86400)} g`
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc)
  if (!m) return tc
  const secs = Number(m[1])
  const min = secs % 60 === 0 ? String(secs / 60) : (FRACTIONS[secs] ?? (secs / 60).toFixed(1))
  return `${min}+${m[2] ?? 0}`
}

/** Width of the board column next to a side panel: as big as the screen height allows. */
export const BOARD_COLUMN = 'w-full shrink-0 lg:w-[min(calc(100vh-11rem),calc(100%-24rem))]'
