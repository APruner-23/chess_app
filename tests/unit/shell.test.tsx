// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from '../../src/routes'
import { navItems } from '../../src/components/navItems'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

// Unmount after each test: a page's live query resolving after the environment is torn
// down otherwise throws "window is not defined".
afterEach(cleanup)

describe('app shell', () => {
  it.each(navItems)('renders the $label page at $path', async ({ path, label }) => {
    renderAt(path)
    // The home page greets the user instead of repeating its name.
    const name = path === '/' ? /^(Home|Buon)/ : label
    // Lazy pages can take more than the default second when the machine is busy.
    expect(await screen.findByRole('heading', { level: 1, name }, { timeout: 5000 })).toBeTruthy()
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
