import type { ComponentType } from 'react'
import { Dashboard } from '../pages/Dashboard'
import { Partite } from '../pages/Partite'
import { Repertori } from '../pages/Repertori'
import { Allenamento } from '../pages/Allenamento'
import { Feedback } from '../pages/Feedback'
import { Impostazioni } from '../pages/Impostazioni'

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
