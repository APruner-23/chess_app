import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { navItems } from './components/navItems'
import { NotFound } from './pages/NotFound'
import { Partita } from './pages/Partita'
import { Editor } from './pages/Editor'
import { OAuth } from './pages/OAuth'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      ...navItems.map(({ path, Page }) =>
        path === '/' ? { index: true, element: <Page /> } : { path, element: <Page /> },
      ),
      { path: 'partite/:id', element: <Partita /> },
      { path: 'repertori/:id', element: <Editor /> },
      { path: 'oauth', element: <OAuth /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
