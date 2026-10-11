import { lazy, type ComponentType } from 'react'

const RELOADED = 'chunkReload'

/**
 * After a deploy, a tab still running the old version asks for old chunk files that
 * no longer exist. Reload once to pick up the new version instead of failing.
 */
function reloadOnce(error: unknown): never {
  if (!sessionStorage.getItem(RELOADED)) {
    sessionStorage.setItem(RELOADED, '1')
    location.reload()
  }
  throw error
}

/** Each page is its own chunk: the first load on a phone only fetches the shell. */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() =>
    load().then((m) => {
      sessionStorage.removeItem(RELOADED)
      return { default: m[name] }
    }, reloadOnce),
  )

export const Dashboard = page(() => import('../pages/Dashboard'), 'Dashboard')
export const Partite = page(() => import('../pages/Partite'), 'Partite')
export const Repertori = page(() => import('../pages/Repertori'), 'Repertori')
export const Allenamento = page(() => import('../pages/Allenamento'), 'Allenamento')
export const Feedback = page(() => import('../pages/Feedback'), 'Feedback')
export const Impostazioni = page(() => import('../pages/Impostazioni'), 'Impostazioni')
export const Partita = page(() => import('../pages/Partita'), 'Partita')
export const Editor = page(() => import('../pages/Editor'), 'Editor')
export const OAuth = page(() => import('../pages/OAuth'), 'OAuth')

export interface NavItem {
  path: string
  label: string
  /** Shorter label for the phone bottom bar. */
  short: string
  icon: string
  Page: ComponentType
}

/** Main sections of the app, in navigation order. */
export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', short: 'Home', icon: '♔', Page: Dashboard },
  { path: '/partite', label: 'Partite', short: 'Partite', icon: '♟', Page: Partite },
  { path: '/repertori', label: 'Repertori', short: 'Repertori', icon: '♘', Page: Repertori },
  { path: '/allenamento', label: 'Allenamento', short: 'Allena', icon: '♗', Page: Allenamento },
  { path: '/feedback', label: 'Feedback', short: 'Feedback', icon: '♖', Page: Feedback },
  // U+FE0E asks for the text glyph, not the colored emoji.
  {
    path: '/impostazioni',
    label: 'Impostazioni',
    short: 'Opzioni',
    icon: '⚙\uFE0E',
    Page: Impostazioni,
  },
]
