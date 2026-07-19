import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  pendingLabel?: string
  eyebrow?: string
  tone?: 'danger' | 'warning'
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending = false,
  pendingLabel = 'Working…',
  eyebrow,
  tone = 'danger',
  onClose,
  onConfirm,
}: ConfirmationDialogProps) {
  const descriptionId = useId()
  const isWarning = tone === 'warning'
  const close = () => {
    if (!pending) onClose()
  }

  return (
    <Dialog open={open} onClose={close} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-950/65 backdrop-blur-[2px] transition-opacity duration-200 data-[closed]:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
        <DialogPanel
          transition
          aria-describedby={descriptionId}
          className="w-full overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl transition duration-200 ease-out data-[closed]:translate-y-3 data-[closed]:scale-[0.98] data-[closed]:opacity-0 motion-reduce:transform-none motion-reduce:transition-none sm:max-w-md sm:rounded-xl"
        >
          <div aria-hidden="true" className="grid h-1 grid-cols-[4.5rem_1fr]">
            <div className="bg-jackson-gold" />
            <div className={isWarning ? 'bg-gray-950' : 'bg-red-600'} />
          </div>

          <div className="px-5 pb-5 pt-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border ${isWarning ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">
                  {eyebrow ?? (isWarning ? 'Unsaved changes' : 'Permanent action')}
                </p>
                <DialogTitle className="mt-1 font-serif text-xl font-semibold text-gray-950">
                  {title}
                </DialogTitle>
              </div>
              <button
                type="button"
                aria-label="Close confirmation"
                onClick={close}
                disabled={pending}
                className="grid min-h-11 min-w-11 place-items-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div id={descriptionId} className="mt-4 text-sm leading-6 text-gray-600">
              {description}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              autoFocus
              onClick={close}
              disabled={pending}
              className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={pending}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${isWarning ? 'bg-gray-950 hover:bg-gray-800 focus-visible:ring-jackson-gold' : 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600'}`}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
