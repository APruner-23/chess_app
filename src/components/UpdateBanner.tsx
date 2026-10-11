import { useRegisterSW } from 'virtual:pwa-register/react'

/** Registers the service worker and offers a new version when one is ready. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex flex-wrap items-center gap-3 rounded-lg border border-stone-700 bg-stone-900 p-3 text-sm shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm">
      <span className="flex-1">
        È disponibile una nuova versione. Aggiornando si ferma l'eventuale analisi in corso.
      </span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded-md bg-emerald-700 px-3 py-1.5 font-medium hover:bg-emerald-600"
      >
        Aggiorna
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="text-stone-400 hover:underline"
      >
        Dopo
      </button>
    </div>
  )
}
