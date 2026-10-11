import { create } from 'zustand'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { SYNC_KEY_SETTING, syncNow, SyncError } from '../sync/sync'

interface SyncStoreState {
  running: boolean
  error?: string
  lastResult?: { pushed: number; pulled: number; at: number }
  /** Syncs if a key is set; concurrent calls share the running sync. */
  run: () => Promise<void>
}

let current: Promise<void> | undefined

export const useSyncStore = create<SyncStoreState>((set) => ({
  running: false,
  run: () => {
    current ??= (async () => {
      const key = await getSetting<string | undefined>(db, SYNC_KEY_SETTING, undefined)
      if (!key) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      set({ running: true, error: undefined })
      try {
        const r = await syncNow(db, { key })
        set({ lastResult: { ...r, at: Date.now() } })
      } catch (e) {
        set({ error: e instanceof SyncError ? e.message : 'Server non raggiungibile.' })
      } finally {
        set({ running: false })
      }
    })().finally(() => {
      current = undefined
    })
    return current
  },
}))

const EVERY_MS = 3 * 60_000

/** Syncs on start, when the app comes back to the foreground, and every few minutes. */
export function startAutoSync(): () => void {
  const run = () => void useSyncStore.getState().run()
  const onVisibility = () => run()
  run()
  const timer = setInterval(() => document.visibilityState === 'visible' && run(), EVERY_MS)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', run)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', run)
  }
}
