import type { FormEvent } from 'react'
import {
  AlertCircle,
  Eye,
  EyeOff,
  FileText,
  Layers3,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'

interface MagicPatternLoginPageProps {
  email: string
  password: string
  rememberMe: boolean
  showPassword: boolean
  isLoading: boolean
  error: string | null
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onRememberMeChange: (value: boolean) => void
  onTogglePassword: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

const assurances = [
  {
    icon: Layers3,
    title: 'A complete picture',
    description:
      'Accounts, holdings, and ownership stay connected to the families and advisors behind them.',
  },
  {
    icon: FileText,
    title: 'Numbers you can trace',
    description:
      'Every figure keeps its source document, change history, and review status.',
  },
  {
    icon: ShieldCheck,
    title: 'Reviewed before it reports',
    description:
      'Calculated values surface their own issues so nothing reaches a client report unchecked.',
  },
]

function JacksonLogo({ inverse = false, large = false }: { inverse?: boolean; large?: boolean }) {
  return (
    <span className={`inline-flex items-center ${large ? 'gap-3' : 'gap-2.5'}`} role="img" aria-label="Jackson">
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-jackson-gold font-serif font-bold text-gray-950 ${large ? 'h-10 w-10 text-xl' : 'h-8 w-8 text-lg'}`}
      >
        J
      </span>
      <span
        className={`font-serif font-bold uppercase tracking-[0.16em] ${large ? 'text-xl' : 'text-base'} ${inverse ? 'text-white' : 'text-gray-900'}`}
      >
        Jackson
      </span>
    </span>
  )
}

export function MagicPatternLoginPage({
  email,
  password,
  rememberMe,
  showPassword,
  isLoading,
  error,
  onEmailChange,
  onPasswordChange,
  onRememberMeChange,
  onTogglePassword,
  onSubmit,
}: MagicPatternLoginPageProps) {
  const errorDescriptionId = error ? 'magic-login-error' : undefined
  const inputClassName =
    'block w-full rounded-md border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <main className="flex min-h-screen w-full bg-gray-100" data-design-variant="magic-patterns">
      <section
        aria-label="About Jackson"
        className="hidden w-[46%] max-w-[620px] flex-col justify-between bg-gray-900 px-12 py-10 lg:flex"
      >
        <JacksonLogo inverse />

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            The record of truth for your family office.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            One workspace for assets, activity, and reporting—reconciled, reviewable, and audit-ready.
          </p>

          <ul className="mt-10 space-y-6">
            {assurances.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/10"
                >
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Jackson. For authorized personnel only.
        </p>
      </section>

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-6 py-12 sm:px-8">
        <div className="mb-8 lg:hidden">
          <JacksonLogo large />
        </div>

        <section
          aria-labelledby="magic-login-title"
          className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <header className="mb-6 text-center">
            <h1 id="magic-login-title" className="text-xl font-semibold tracking-tight text-gray-900">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-gray-500">Access your family office workspace</p>
          </header>

          {error ? (
            <div
              id="magic-login-error"
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div>
              <label htmlFor="magic-login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id="magic-login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="you@company.com"
                  aria-invalid={Boolean(error)}
                  aria-describedby={errorDescriptionId}
                  className={inputClassName}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="magic-login-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  className="rounded text-xs font-medium text-gray-600 underline-offset-2 transition-colors hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
                  onClick={() => undefined}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id="magic-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="••••••••"
                  aria-invalid={Boolean(error)}
                  aria-describedby={errorDescriptionId}
                  className={`${inputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={onTogglePassword}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 disabled:cursor-not-allowed"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                name="remember"
                checked={rememberMe}
                disabled={isLoading}
                onChange={(event) => onRememberMeChange(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
              />
              Remember me for 30 days
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <footer className="mt-6 text-center text-sm text-gray-500">
            Need access? <span className="font-medium text-gray-900">Contact your administrator</span>
          </footer>
        </section>

        <p className="mt-6 flex items-center gap-1.5 text-center text-xs text-gray-500">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          MFA follows your organization&apos;s access policy.
        </p>
      </div>
    </main>
  )
}
