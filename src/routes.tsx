import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import {
  Editor,
  OAuth,
  Partita,
  Finali,
  Puzzle,
  Scouting,
  Sparring,
  navItems,
} from './components/navItems'
import { NotFound } from './pages/NotFound'

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
      { path: 'puzzle', element: <Puzzle /> },
      { path: 'sparring', element: <Sparring /> },
      { path: 'finali', element: <Finali /> },
      { path: 'scouting', element: <Scouting /> },
      { path: 'oauth', element: <OAuth /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
