import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import {
  BOARD_KEY,
  BOARDS,
  DEFAULT_APPEARANCE,
  PIECE_SETS,
  PIECES_KEY,
  THEME_KEY,
  type ThemeMode,
} from './appearance'

const option = (active: boolean) =>
  `rounded-md border p-1.5 text-xs transition-colors ${
    active ? 'border-emerald-500' : 'border-stone-700 hover:border-stone-500'
  }`

/** Theme, board colors and piece set, on this device. */
export function AppearanceSettings() {
  const a = useLiveQuery(async () => ({
    theme: await getSetting<ThemeMode>(db, THEME_KEY, DEFAULT_APPEARANCE.theme),
    board: await getSetting(db, BOARD_KEY, DEFAULT_APPEARANCE.board),
    pieces: await getSetting(db, PIECES_KEY, DEFAULT_APPEARANCE.pieces),
  }))
  if (!a) return null
  return (
    <>
      <h2 className="pt-4 text-lg font-medium">Aspetto</h2>
      <p className="text-sm text-stone-400">Valgono solo su questo dispositivo.</p>
      <label className="flex items-center gap-3 text-sm">
        Tema
        <select
          value={a.theme}
          onChange={(e) => setSetting(db, THEME_KEY, e.target.value as ThemeMode)}
          className="rounded-md border border-stone-700 bg-stone-950 px-2 py-1"
        >
          <option value="auto">Automatico (come il sistema)</option>
          <option value="dark">Scuro</option>
          <option value="light">Chiaro</option>
        </select>
      </label>
      <div className="text-sm">
        <div className="mb-1">Scacchiera</div>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Colori della scacchiera"
        >
          {BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={a.board === b.id}
              onClick={() => setSetting(db, BOARD_KEY, b.id)}
              className={option(a.board === b.id)}
            >
              <span
                className="mb-1 block h-10 w-10 rounded-sm"
                style={{
                  background: `conic-gradient(${b.dark} 0 25%, ${b.light} 0 50%, ${b.dark} 0 75%, ${b.light} 0)`,
                  backgroundSize: '50% 50%',
                }}
              />
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-sm">
        <div className="mb-1">Pezzi</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Set di pezzi">
          {PIECE_SETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={a.pieces === p.id}
              onClick={() => setSetting(db, PIECES_KEY, p.id)}
              className={option(a.pieces === p.id)}
            >
              <img
                src={`${import.meta.env.BASE_URL}pieces/${p.id}/wN.svg`}
                alt=""
                className="mb-1 block h-10 w-10 rounded-sm bg-[#b58863]"
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
