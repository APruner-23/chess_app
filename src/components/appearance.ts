/** Appearance choices, per device (device-only settings, mirrored in localStorage). */
export type ThemeMode = 'auto' | 'dark' | 'light'
export const THEME_KEY = 'theme'
export const BOARD_KEY = 'boardTheme'
export const PIECES_KEY = 'pieceSet'

export const BOARDS: { id: string; label: string; light: string; dark: string }[] = [
  { id: 'brown', label: 'Marrone', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', label: 'Blu', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'green', label: 'Verde', light: '#ffffdd', dark: '#86a666' },
  { id: 'grey', label: 'Grigio', light: '#dcdcdc', dark: '#a0a0a0' },
  { id: 'purple', label: 'Viola', light: '#e5dcf0', dark: '#9f84bd' },
]
export const PIECE_SETS = [
  { id: 'cburnett', label: 'Classici' },
  { id: 'merida', label: 'Merida' },
  { id: 'chessnut', label: 'Chessnut' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'spatial', label: 'Spatial' },
]

export interface Appearance {
  theme: ThemeMode
  board: string
  pieces: string
}
export const DEFAULT_APPEARANCE: Appearance = { theme: 'auto', board: 'brown', pieces: 'cburnett' }
const STORAGE = 'appearance'

/** The system prefers a light theme (false where the browser can't tell). */
export function systemLight(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
}

/** Sets data-theme / data-board / data-pieces on <html> (see themes.css). */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement
  const light = a.theme === 'light' || (a.theme === 'auto' && systemLight())
  root.dataset.theme = light ? 'light' : 'dark'
  root.dataset.board = a.board
  root.dataset.pieces = a.pieces
  try {
    localStorage.setItem(STORAGE, JSON.stringify(a))
  } catch {
    // private mode: the settings table still has it
  }
}

/** Applies the last appearance before React starts, so the page doesn't flash dark. */
export function applyStoredAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Appearance | null
    applyAppearance(saved ?? DEFAULT_APPEARANCE)
  } catch {
    applyAppearance(DEFAULT_APPEARANCE)
  }
}
