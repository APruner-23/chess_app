import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { SITE_LABELS, SITES, useAccounts } from '../components/accounts'
import { db } from '../db/schema'
import { IMPORT_MONTHS_KEY, getSetting, setSetting } from '../db/settings'
import type { Account } from '../db/schema'
import type { Site } from '../import/types'

const PERIODS: { label: string; months: number | null }[] = [
  { label: 'Tutte le partite', months: null },
  { label: 'Ultimi 24 mesi', months: 24 },
  { label: 'Ultimi 12 mesi', months: 12 },
  { label: 'Ultimi 6 mesi', months: 6 },
  { label: 'Ultimi 3 mesi', months: 3 },
]

export function Impostazioni() {
  const accounts = useAccounts()
  return (
    <>
      <PageHeader title="Impostazioni" />
      {accounts && <SettingsForm accounts={accounts} />}
    </>
  )
}

function SettingsForm({ accounts }: { accounts: Account[] }) {
  const months = useLiveQuery(() => getSetting<number | null>(db, IMPORT_MONTHS_KEY, null))
  const [names, setNames] = useState<Partial<Record<Site, string>>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.username])),
  )
  const [saved, setSaved] = useState(false)

  async function save() {
    for (const account of accounts) {
      const username = (names[account.id] ?? '').trim()
      if (username === account.username && account.updatedAt) continue
      // A different username starts a fresh import history.
      const changed = username.toLowerCase() !== account.username.toLowerCase()
      await db.accounts.put({
        id: account.id,
        username,
        ...(changed ? {} : { cursor: account.cursor, lastImportAt: account.lastImportAt }),
        updatedAt: Date.now(),
      })
    }
    setSaved(true)
  }

  return (
    <section className="max-w-md space-y-4">
      <h2 className="text-lg font-medium">Account</h2>
      {SITES.map((site) => (
        <label key={site} className="block">
          <span className="text-sm text-stone-400">Username {SITE_LABELS[site]}</span>
          <input
            value={names[site] ?? ''}
            onChange={(e) => {
              setNames({ ...names, [site]: e.target.value })
              setSaved(false)
            }}
            className="mt-1 block w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
            placeholder="Lascia vuoto per non importare"
          />
        </label>
      ))}
      <button
        type="button"
        onClick={save}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600"
      >
        Salva
      </button>
      {saved && <span className="ml-3 text-sm text-emerald-400">Salvato</span>}

      <h2 className="pt-4 text-lg font-medium">Periodo da importare</h2>
      <p className="text-sm text-stone-400">
        Vale per il primo import di ogni account; dopo vengono scaricate solo le partite nuove.
      </p>
      <select
        value={months === null || months === undefined ? '' : String(months)}
        onChange={(e) =>
          setSetting(db, IMPORT_MONTHS_KEY, e.target.value === '' ? null : Number(e.target.value))
        }
        className="block w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2"
      >
        {PERIODS.map((p) => (
          <option key={p.label} value={p.months === null ? '' : String(p.months)}>
            {p.label}
          </option>
        ))}
      </select>
    </section>
  )
}
