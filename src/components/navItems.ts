import { lazy, type ComponentType } from 'react'

/** Each page is its own chunk: the first load on a phone only fetches the shell. */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

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
  icon: string
  Page: ComponentType
}

/** Main sections of the app, in navigation order. */
export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '♔', Page: Dashboard },
  { path: '/partite', label: 'Partite', icon: '♟', Page: Partite },
  { path: '/repertori', label: 'Repertori', icon: '♘', Page: Repertori },
  { path: '/allenamento', label: 'Allenamento', icon: '♗', Page: Allenamento },
  { path: '/feedback', label: 'Feedback', icon: '♖', Page: Feedback },
  { path: '/impostazioni', label: 'Impostazioni', icon: '⚙', Page: Impostazioni },
]
