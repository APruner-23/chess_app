import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { BACKGROUND_GAMES, useAnalysisStore } from './analysisStore'

/** Starts/pauses the engine on the most recent games that have no analysis yet. */
export function BackgroundAnalysisPanel() {
  const { background, startBackground, pauseBackground } = useAnalysisStore()
  const analyzed = useLiveQuery(() => db.analyses.count())
  const games = useLiveQuery(() => db.games.count())
  if (!games) return null
  return (
    <section className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-stone-800 bg-stone-950/40 p-4 text-sm">
      <button
        type="button"
        onClick={background.running ? pauseBackground : startBackground}
        className="rounded-md bg-stone-700 px-4 py-2 font-medium hover:bg-stone-600"
      >
        {background.running ? 'Pausa' : `Analizza le ultime ${BACKGROUND_GAMES}`}
      </button>
      <span className="text-stone-400">
        {background.running
          ? `Analisi in background: ${background.done}/${background.total} partite`
          : background.total > 0 && background.done === background.total
            ? 'Analisi in background completata.'
            : 'Il motore analizza le partite recenti senza analisi, una alla volta.'}{' '}
        {analyzed ?? 0} partite analizzate in tutto.
      </span>
    </section>
  )
}
