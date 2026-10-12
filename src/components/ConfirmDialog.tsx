import { useEffect, useRef } from 'react'

export interface ConfirmRequest {
  title: string
  text: string
  /** Label of the destructive button. */
  confirm: string
  onConfirm: () => void | Promise<void>
}

/** Modal confirmation for destructive actions; `request` undefined = closed. */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request?: ConfirmRequest
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (request && !d.open) d.showModal?.()
    if (!request && d.open) d.close()
  }, [request])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-w-sm rounded-lg border border-stone-700 bg-stone-900 p-5 text-stone-100 backdrop:bg-black/60"
    >
      {request && (
        <>
          <h2 className="mb-2 text-lg font-semibold">{request.title}</h2>
          <p className="mb-5 text-sm text-stone-300">{request.text}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="rounded-md bg-stone-700 px-4 py-2 text-sm hover:bg-stone-600"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={async () => {
                await request.onConfirm()
                onClose()
              }}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600"
            >
              {request.confirm}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
