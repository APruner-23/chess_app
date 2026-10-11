import { create } from 'zustand'
import { db } from '../db/schema'
import { IMPORT_MONTHS_KEY, getSetting } from '../db/settings'
import { importAccount, type ImportProgress } from '../import/sync'
import type { Site } from '../import/types'
import { loadOpenings } from '../openings/load'
import { withDefaults } from './accounts'

interface SiteStatus {
  step: string
  saved: number
  error?: string
  done?: boolean
}

interface ImportState {
  running: boolean
  status: Partial<Record<Site, SiteStatus>>
  start: () => Promise<void>
  cancel: () => void
}

let controller: AbortController | undefined

/** Import state lives outside the page, so it survives navigation. */
export const useImportStore = create<ImportState>((set, get) => ({
  running: false,
  status: {},
  cancel: () => controller?.abort(),
  start: async () => {
    if (get().running) return
    controller = new AbortController()
    set({ running: true, status: {} })
    const update = (site: Site, patch: Partial<SiteStatus>) =>
      set((s) => ({
        status: { ...s.status, [site]: { step: '', saved: 0, ...s.status[site], ...patch } },
      }))
    const openings = await loadOpenings()
    const months = await getSetting<number | null>(db, IMPORT_MONTHS_KEY, null)
    const since = months === null ? undefined : Date.now() - months * 30.44 * 24 * 60 * 60 * 1000
    const accounts = withDefaults(await db.accounts.toArray()).filter((a) => a.username.trim())
    // Sites run one after the other: simpler progress, and Chess.com wants serial requests anyway.
    for (const account of accounts) {
      update(account.id, { step: 'In corso…' })
      try {
        const saved = await importAccount(account, {
          db,
          openings,
          since,
          signal: controller.signal,
          onProgress: (p: ImportProgress) => update(p.site, { step: p.step, saved: p.saved }),
        })
        update(account.id, { saved, step: `${saved} partite nuove o aggiornate`, done: true })
      } catch (e) {
        const aborted = controller.signal.aborted
        update(account.id, {
          error: aborted ? 'Interrotto' : e instanceof Error ? e.message : String(e),
        })
        if (aborted) break
      }
    }
    set({ running: false })
  },
}))
