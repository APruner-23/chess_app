import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { db } from '../db/schema'
import type { Color } from '../import/types'
import { createRepertoire } from '../repertoire/repo'

const input = 'rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm'

export function Repertori() {
  const navigate = useNavigate()
  const reps = useLiveQuery(() => db.repertoires.orderBy('id').toArray())
  const counts = useLiveQuery(async () => {
    const byRep = new Map<string, number>()
    await db.repMoves.each((m) => byRep.set(m.repertoireId, (byRep.get(m.repertoireId) ?? 0) + 1))
    return byRep
  })
  const [name, setName] = useState('')
  const [color, setColor] = useState<Color>('white')
  const [experimental, setExperimental] = useState(false)

  async function create() {
    const rep = await createRepertoire(db, {
      name: name.trim() || 'Nuovo repertorio',
      color,
      experimental,
    })
    navigate(`/repertori/${rep.id}`)
  }

  return (
    <>
      <PageHeader title="Repertori">
        Prepara le linee che incontri davvero: l'explorer mostra cosa si gioca al tuo livello.
      </PageHeader>

      <section className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-stone-800 bg-stone-950/40 p-4">
        <label className="flex flex-col text-sm text-stone-400">
          Nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
            placeholder="Es. Siciliana col Nero"
          />
        </label>
        <label className="flex flex-col text-sm text-stone-400">
          Colore
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as Color)}
            className={input}
          >
            <option value="white">Bianco</option>
            <option value="black">Nero</option>
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={experimental}
            onChange={(e) => setExperimental(e.target.checked)}
          />
          Sperimentale
        </label>
        <button
          type="button"
          onClick={create}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600"
        >
          Crea repertorio
        </button>
      </section>

      {reps?.length === 0 && <p className="text-stone-400">Nessun repertorio ancora.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reps
          ?.slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((r) => (
            <li key={r.id}>
              <Link
                to={`/repertori/${r.id}`}
                className="block rounded-lg border border-stone-800 bg-stone-950/40 p-4 hover:border-stone-600"
              >
                <div className="flex items-center gap-2 font-medium">
                  <span>{r.color === 'white' ? '○' : '●'}</span>
                  {r.name}
                  {r.experimental && (
                    <span className="rounded bg-amber-900/60 px-1.5 text-xs text-amber-200">
                      sperimentale
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-stone-400">
                  {r.color === 'white' ? 'Bianco' : 'Nero'} · {counts?.get(r.id) ?? 0} mosse
                </div>
              </Link>
            </li>
          ))}
      </ul>
    </>
  )
}
