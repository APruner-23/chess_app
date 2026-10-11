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
