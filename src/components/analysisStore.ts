import { create } from 'zustand'
import { analyzeGame, PRESETS, type Preset } from '../analysis/analyzeGame'
import { analysisOrder, etaMs } from '../analysis/order'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { engineQueue } from '../engine/instance'
import { AUTO_ANALYZE_SETTING } from '../sync/sync'
import type { Priority } from '../engine/queue'
import type { Game } from '../import/types'

export const PRESET_KEY = 'enginePreset'
/** Device-only setting: analyze games in the background whenever the app is open. */
export const AUTO_ANALYZE_KEY = AUTO_ANALYZE_SETTING
/**
 * Nodes per position in the background pass: about 4× faster than the "veloce" preset,
 * still enough to find mistakes and blunders. Opening a game and asking for an
 * analysis redoes it with the user's preset.
 */
export const BACKGROUND_NODES = 40_000

/** Phones get the fast preset by default. */
export function defaultPreset(): Preset {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    ? 'veloce'
    : 'accurata'
}

async function analyzeAndSave(
  game: Game,
  priority: Priority,
  signal: AbortSignal,
  onProgress: (d: number, t: number) => void,
) {
  const nodes =
    priority === 'background'
      ? BACKGROUND_NODES
      : PRESETS[await getSetting<Preset>(db, PRESET_KEY, defaultPreset())]
  const queue = engineQueue('analysis')
  const analysis = await analyzeGame(
    game,
    async (fen, sig) => {
      const handle = queue.submit({ fen, nodes }, priority)
      sig?.addEventListener('abort', handle.cancel)
      const { lines, bestMove } = await handle.result
      return { eval: lines[0]?.eval ?? { cp: 0 }, best: bestMove }
    },
    { signal, onProgress },
  )
  // Saved once, at the end: a stopped analysis leaves nothing half-done behind.
  if (analysis) await db.analyses.put({ ...analysis, nodes })
  return analysis
}

interface AnalysisState {
  /** Progress (0…1) of games being analyzed on request, by game id. */
  progress: Record<string, number>
  background: {
    running: boolean
    done: number
    total: number
    current?: string
    /** Estimated time left, once a game is done. */
    etaMs?: number
  }
  analyze: (game: Game) => Promise<void>
  startBackground: () => Promise<void>
  pauseBackground: () => void
}

const controllers = new Map<string, AbortController>()
let backgroundController: AbortController | undefined

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  progress: {},
  background: { running: false, done: 0, total: 0 },

  analyze: async (game) => {
    if (controllers.has(game.id)) return
    const controller = new AbortController()
    controllers.set(game.id, controller)
    const setProgress = (p: number | undefined) =>
      set((s) => {
        const progress = { ...s.progress }
        if (p === undefined) delete progress[game.id]
        else progress[game.id] = p
        return { progress }
      })
    setProgress(0)
    try {
      await analyzeAndSave(game, 'game', controller.signal, (d, t) => setProgress(d / t))
    } finally {
      controllers.delete(game.id)
      setProgress(undefined)
    }
  },

  /** Analyzes every game without analysis, most useful first (`analysisOrder`), one at a time. */
  startBackground: async () => {
    if (get().background.running) return
    backgroundController = new AbortController()
    const signal = backgroundController.signal
    const analyzed = new Set(await db.analyses.toCollection().primaryKeys())
    const todo = analysisOrder(await db.games.toArray(), analyzed, Date.now())
    set({ background: { running: true, done: 0, total: todo.length } })
    const started = performance.now()
    for (const [i, game] of todo.entries()) {
      if (signal.aborted) break
      // Analyzed meanwhile (opened by the user, or synced from another device).
      if (!(await db.analyses.get(game.id))) {
        set((s) => ({ background: { ...s.background, current: game.id } }))
        await analyzeAndSave(game, 'background', signal, () => {})
      }
      if (!signal.aborted)
        set((s) => ({
          background: {
            ...s.background,
            done: i + 1,
            etaMs: etaMs(i + 1, performance.now() - started, todo.length - i - 1),
          },
        }))
    }
    set((s) => ({ background: { ...s.background, running: false, current: undefined } }))
  },

  pauseBackground: () => backgroundController?.abort(),
}))
