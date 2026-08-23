import { X } from 'lucide-react'
import { type HTMLAttributes, type ReactNode, useEffect } from 'react'
import { Button, type ButtonProps, type ButtonVariant } from '../../../../components/shared/Button'

export const mpInputClass =
  'mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-focus focus:ring-2 focus:ring-focus/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

export const mpLabelClass = 'block text-[0.78rem] font-medium text-slate-800'

export function MagicButton({
  variant = 'primary',
  ...props
}: ButtonProps & { variant?: Exclude<ButtonVariant, 'inverse'> }) {
  return <Button {...props} variant={variant} size="sm" />
}

export function MagicStatusBadge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'calculated'
  className?: string
}) {
  const tones = {
    neutral: 'border-slate-300 bg-slate-50 text-slate-700',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-800',
    info: 'border-sky-300 bg-sky-50 text-sky-800',
    calculated: 'border-blue-100 bg-blue-50 text-blue-700',
  }
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-medium leading-4 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function MagicCard({
  children,
  className = '',
  ...props
}: {
  children: ReactNode
  className?: string
} & HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={`rounded-lg border border-slate-300 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  )
}

function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])
}

export function MagicModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  useOverlay(open, onClose)
  if (!open) return null
  const titleId = `magic-modal-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm leading-5 text-slate-600">{description}</div> : null}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="grid min-h-9 min-w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function MagicDrawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useOverlay(open, onClose)
  if (!open) return null
  const titleId = `magic-drawer-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/30 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-slate-600">{description}</div> : null}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="grid min-h-9 min-w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function MagicConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  pending?: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <MagicModal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </MagicButton>
          <MagicButton type="button" variant="danger" onClick={() => void onConfirm()} disabled={pending}>
            {pending ? 'Working…' : confirmLabel}
          </MagicButton>
        </>
      }
    >
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
        {description}
      </div>
    </MagicModal>
  )
}

export function MagicFieldGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
