import { create } from 'zustand'
import { analyzeGame, PRESETS, type Preset } from '../analysis/analyzeGame'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { engineQueue } from '../engine/instance'
import type { Priority } from '../engine/queue'
import type { Game } from '../import/types'

export const PRESET_KEY = 'enginePreset'
export const BACKGROUND_GAMES = 100

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
  const preset = await getSetting<Preset>(db, PRESET_KEY, defaultPreset())
  const queue = engineQueue()
  const analysis = await analyzeGame(
    game,
    async (fen, sig) => {
      const handle = queue.submit({ fen, nodes: PRESETS[preset] }, priority)
      sig?.addEventListener('abort', handle.cancel)
      const { lines, bestMove } = await handle.result
      return { eval: lines[0]?.eval ?? { cp: 0 }, best: bestMove }
    },
    { signal, onProgress },
  )
  // Saved once, at the end: a stopped analysis leaves nothing half-done behind.
  if (analysis) await db.analyses.put(analysis)
  return analysis
}

interface AnalysisState {
  /** Progress (0…1) of games being analyzed on request, by game id. */
  progress: Record<string, number>
  background: { running: boolean; done: number; total: number; current?: string }
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

  /** Analyzes the most recent games that have no analysis yet, one at a time. */
  startBackground: async () => {
    if (get().background.running) return
    backgroundController = new AbortController()
    const signal = backgroundController.signal
    const recent = await db.games.orderBy('playedAt').reverse().limit(BACKGROUND_GAMES).toArray()
    const analyzed = new Set(
      await db.analyses
        .where('id')
        .anyOf(recent.map((g) => g.id))
        .primaryKeys(),
    )
    const todo = recent.filter((g) => !analyzed.has(g.id))
    set({ background: { running: true, done: 0, total: todo.length } })
    for (const [i, game] of todo.entries()) {
      if (signal.aborted) break
      set((s) => ({ background: { ...s.background, current: game.id } }))
      await analyzeAndSave(game, 'background', signal, () => {})
      if (!signal.aborted) set((s) => ({ background: { ...s.background, done: i + 1 } }))
    }
    set((s) => ({ background: { ...s.background, running: false, current: undefined } }))
  },

  pauseBackground: () => backgroundController?.abort(),
}))
