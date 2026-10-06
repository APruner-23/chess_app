import { NavLink, Outlet } from 'react-router'
import { navItems } from './navItems'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-stone-700 text-white' : 'text-stone-300 hover:bg-stone-800'
  }`

/** App shell: sidebar on desktop, bottom bar on phones, page content in the middle. */
export function Layout() {
  return (
    <div className="flex min-h-dvh">
      <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-stone-800 p-3 md:flex">
        <div className="mb-4 px-3 text-lg font-semibold">chess_app</div>
        {navItems.map(({ path, label, icon }) => (
          <NavLink key={path} to={path} end={path === '/'} className={linkClass}>
            <span className="w-5 text-center text-lg">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 md:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t border-stone-800 bg-stone-900 md:hidden">
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            aria-label={label}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 text-[10px] ${isActive ? 'text-white' : 'text-stone-400'}`
            }
          >
            <span className="text-xl leading-none">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
