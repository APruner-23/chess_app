import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { navItems } from './components/navItems'
import { NotFound } from './pages/NotFound'
import { Partita } from './pages/Partita'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      ...navItems.map(({ path, Page }) =>
        path === '/' ? { index: true, element: <Page /> } : { path, element: <Page /> },
      ),
      { path: 'partite/:id', element: <Partita /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
