import { useRef, useState } from 'react'
import { db } from '../db/schema'
import { exportBackup, importBackup, type Backup } from '../db/backup'

/** JSON backup: download everything, or merge a file back in (newer records win). */
export function BackupSettings() {
  const file = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string>()

  async function download() {
    const backup = await exportBackup(db)
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chess_app-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function restore(f: File) {
    try {
      setStatus('Ripristino in corso…')
      const r = await importBackup(db, JSON.parse(await f.text()) as Backup)
      setStatus(
        `Fatto: ${r.added} record nuovi, ${r.updated} aggiornati, ${r.skipped} già presenti.`,
      )
    } catch (e) {
      setStatus(e instanceof SyntaxError ? 'Il file non è un JSON valido.' : (e as Error).message)
    }
  }

  const btn = 'rounded-md bg-stone-700 px-4 py-2 text-sm font-medium hover:bg-stone-600'
  return (
    <>
      <h2 className="pt-4 text-lg font-medium">Backup</h2>
      <p className="text-sm text-stone-400">
        Un file JSON con partite, analisi, repertori, allenamento e feedback (senza il token di
        Lichess). Ripristinarlo su un altro dispositivo unisce i dati: per ogni elemento vince la
        versione più recente.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={download}>
          Esporta backup
        </button>
        <button type="button" className={btn} onClick={() => file.current?.click()}>
          Importa backup
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void restore(f)
            e.target.value = ''
          }}
        />
      </div>
      {status && <p className="text-sm text-stone-300">{status}</p>}
    </>
  )
}
