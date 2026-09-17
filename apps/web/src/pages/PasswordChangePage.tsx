import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { Button } from '../components/shared/Button'

const errorMessage = (error: unknown): string => {
  if (!error || typeof error !== 'object') return 'The password could not be changed. Try again.'
  const input = error as { error?: string; code?: string }
  if (input.error === 'NETWORK_ERROR') return 'Authentication service is unavailable. Start the API server and try again.'
  if (input.error === 'PASSWORD_CHANGE_INVALID') return 'This password-change session expired. Sign in again to request a new one.'
  if (input.code === 'PASSWORD_TOO_SHORT') return 'Use a longer password or passphrase.'
  if (input.code === 'PASSWORD_TOO_LONG') return 'The password is longer than the supported maximum.'
  if (input.code === 'PASSWORD_COMMON') return 'That password is too common. Choose a unique passphrase.'
  if (input.code === 'PASSWORD_CONTEXT_SPECIFIC') return 'Do not use your name, email, or Jackson as your password.'
  if (input.code === 'PASSWORD_REUSE') return 'Choose a password different from your temporary password.'
  return 'The password did not meet the security requirements.'
}

export function PasswordChangePage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [change] = useState(() => authFlowStore.getPasswordChange())
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!change) navigate('/', { replace: true })
  }, [change, navigate])

  const characterCount = useMemo(() => [...password.normalize('NFC')].length, [password])
  const minimum = change?.policy.minimumCharacters ?? 15
  const lengthReady = characterCount >= minimum
  const matches = password.length > 0 && password === confirmation

  if (!change) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!lengthReady) {
      setError(`Use at least ${minimum} characters.`)
      return
    }
    if (!matches) {
      setError('The confirmation does not match the new password.')
      return
    }
    setPending(true)
    try {
      await authClient.changePassword(change.changeToken, password)
      authFlowStore.clear()
      setComplete(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(20,83,45,0.48),transparent_34%),radial-gradient(circle_at_86%_82%,rgba(30,64,175,0.28),transparent_32%)]" aria-hidden="true" />
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        aria-labelledby="password-change-title"
        className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[0.82fr_1.18fr]"
      >
        <aside className="border-b border-emerald-950 bg-emerald-950 p-7 lg:border-b-0 lg:border-r lg:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-600/40 bg-emerald-900 text-emerald-100">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.22em] text-emerald-300">Identity checkpoint</p>
          <h1 id="password-change-title" className="mt-3 text-3xl font-semibold tracking-tight">Secure your account</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-emerald-100/75">
            Replace the temporary bootstrap credential before Jackson creates a session or starts MFA enrollment.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-emerald-50" aria-label="Password guidance">
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Use a unique passphrase with at least {minimum} characters.</li>
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Spaces, punctuation, and password-manager generated values are accepted.</li>
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Common passwords and account-specific phrases are blocked.</li>
          </ul>
        </aside>

        <div className="p-7 text-slate-950 sm:p-10">
          {complete ? (
            <div role="status" className="flex min-h-[28rem] flex-col justify-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <Check className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold">Password updated</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Sign in again with the new password. Jackson will then continue to the configured MFA step.</p>
              <Button className="mt-7 w-fit" onClick={() => navigate('/', { replace: true })}>Return to sign in</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="min-h-[28rem]">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700"><KeyRound className="h-5 w-5" aria-hidden="true" /></div>
                <div><h2 className="text-xl font-semibold">Choose a new password</h2><p className="text-sm text-slate-500">This change revokes any existing sessions.</p></div>
              </div>

              {error ? <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

              <div className="mt-7 space-y-5">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-800">New password</label>
                  <div className="relative">
                    <input id="new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-field min-h-12 pr-12" maxLength={change.policy.maximumCharacters} autoFocus />
                    <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-md text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className={lengthReady ? 'text-emerald-700' : 'text-slate-500'}>{lengthReady ? 'Length requirement met' : `${minimum - characterCount} more characters required`}</span>
                    <span className="font-mono tabular-nums text-slate-500">{characterCount}/{change.policy.maximumCharacters}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={`h-full rounded-full transition-[width,background-color] motion-reduce:transition-none ${lengthReady ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (characterCount / minimum) * 100)}%` }} /></div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-800">Confirm new password</label>
                  <input id="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input-field min-h-12" maxLength={change.policy.maximumCharacters} />
                  {confirmation ? <p className={`mt-2 text-xs ${matches ? 'text-emerald-700' : 'text-red-700'}`}>{matches ? 'Passwords match' : 'Passwords do not match'}</p> : null}
                </div>
              </div>

              <Button type="submit" pending={pending} disabled={!lengthReady || !matches} size="lg" className="mt-7 w-full">Set password</Button>
              <p className="mt-5 text-center text-xs text-slate-500">Need to restart? <Link to="/" className="font-medium text-primary hover:underline">Return to sign in</Link></p>
            </form>
          )}
        </div>
      </motion.section>
    </main>
  )
}
