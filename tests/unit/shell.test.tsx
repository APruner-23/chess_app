// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '../../src/routes'
import { navItems } from '../../src/components/navItems'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

describe('app shell', () => {
  it.each(navItems)('renders the $label page at $path', ({ path, label }) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy()
  })

  it('shows a not-found page for unknown paths', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Pagina non trovata' })).toBeTruthy()
  })
})

describe('test environment', () => {
  it('provides IndexedDB through fake-indexeddb', () => {
    expect(typeof indexedDB.open).toBe('function')
  })
})
