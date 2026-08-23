import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { Clock3, Loader2, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/shared/Button'
import { authClient } from './authClient'
import { sessionStore, useSession } from './sessionStore'

const WARNING_WINDOW_SECONDS = 120

const remainingSecondsUntil = (deadline: number | null) =>
  deadline == null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

const formatCountdown = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function SessionExpiryDialog() {
  const { status, idleExpiresAt } = useSession()
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    remainingSecondsUntil(idleExpiresAt),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || idleExpiresAt == null) return

    const tick = () => {
      const remaining = remainingSecondsUntil(idleExpiresAt)
      setRemainingSeconds(remaining)
      if (remaining === 0) {
        sessionStore.setUnauthenticated()
        void authClient.logout().catch(() => undefined)
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [idleExpiresAt, status])

  const staySignedIn = async () => {
    setPending(true)
    setError(null)
    try {
      const session = await authClient.extendSession()
      sessionStore.setAuthenticated(session)
    } catch {
      if (sessionStore.getSnapshot().status === 'authenticated') {
        setError('Your session could not be extended. Check your connection and try again.')
      }
    } finally {
      setPending(false)
    }
  }

  const signOut = () => {
    sessionStore.setUnauthenticated()
    void authClient.logout().catch(() => undefined)
  }

  const open =
    status === 'authenticated' &&
    idleExpiresAt != null &&
    remainingSeconds > 0 &&
    remainingSeconds <= WARNING_WINDOW_SECONDS

  return (
    <Dialog role="alertdialog" open={open} onClose={() => undefined} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-gray-950/65 backdrop-blur-[2px]" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel
          aria-describedby="session-expiry-description"
          className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        >
          <div aria-hidden="true" className="h-1 bg-amber-500" />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-amber-300 bg-amber-50 text-amber-800">
                <Clock3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
                  Session security
                </p>
                <DialogTitle className="mt-1 font-serif text-xl font-semibold text-gray-950">
                  Your session is about to expire
                </DialogTitle>
              </div>
            </div>

            <p id="session-expiry-description" className="mt-4 text-sm leading-6 text-gray-600">
              For your security, you’ll be signed out after 30 minutes without an authenticated
              request. Choose stay signed in to start a new 30-minute idle period.
            </p>

            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Signing out in
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-amber-950" aria-live="polite">
                {formatCountdown(remainingSeconds)}
              </p>
            </div>

            {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={signOut} disabled={pending}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out now
            </Button>
            <Button onClick={() => void staySignedIn()} pending={pending} autoFocus>
              {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {pending ? 'Extending session…' : 'Stay signed in'}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
