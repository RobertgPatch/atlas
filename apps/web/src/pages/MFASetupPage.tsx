import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, Loader2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authClient, type ApiError } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'

const getEnrollmentErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'error' in error &&
    (error as ApiError).error === 'ACCOUNT_LOCKED'
  ) {
    return 'Too many invalid codes. Please wait and try again.'
  }

  if (
    error &&
    typeof error === 'object' &&
    'error' in error &&
    (error as ApiError).error === 'NETWORK_ERROR'
  ) {
    return 'Authentication service is unavailable. Start the API server and try again.'
  }

  return 'The verification code was invalid. Scan the QR code again and try a fresh code.'
}

export function MFASetupPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const enrollment = authFlowStore.getEnrollment()

  useEffect(() => {
    if (!enrollment) {
      navigate('/', { replace: true })
    }
  }, [enrollment, navigate])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!enrollment) {
    return null
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.manualEntryKey)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (code.length !== 6) {
      setError('Enter the 6-digit code from Google Authenticator to finish setup.')
      return
    }

    setIsLoading(true)
    try {
      const session = await authClient.completeMfaEnrollment(
        enrollment.enrollmentToken,
        code,
      )
      authFlowStore.clear()
      sessionStore.setAuthenticated(session)
      navigate('/dashboard')
    } catch (err) {
      setError(getEnrollmentErrorMessage(err))
      setCode('')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <span className="text-atlas-gold font-serif font-bold text-lg">A</span>
          </div>
          <span className="text-xl font-serif font-bold text-gray-900 tracking-widest uppercase">
            Atlas
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-10">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 leading-tight">
                Set up authenticator MFA
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Register an authenticator app to finish signing in to Atlas.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Scan QR */}
          <section className="mb-8">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold">1</span>
              <h3 className="text-sm font-semibold text-gray-900">Scan the QR code</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4 ml-8">
              Open Google Authenticator, 1Password, or any TOTP app, tap "Add account", and scan this code.
            </p>
            <div className="ml-8 flex justify-center sm:justify-start">
              <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                <img
                  src={enrollment.qrCodeDataUrl}
                  alt="Scan this QR code with your authenticator app"
                  className="w-48 h-48 block"
                />
              </div>
            </div>
          </section>

          {/* Step 2: Manual entry fallback */}
          <section className="mb-8">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold">2</span>
              <h3 className="text-sm font-semibold text-gray-900">Or enter the key manually</h3>
            </div>
            <div className="ml-8">
              <p className="text-sm text-gray-600 mb-3">
                If your app can't scan the code, add an account manually with this setup key.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-mono text-gray-900 tracking-wide break-all">
                  {enrollment.manualEntryKey}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </section>

          {/* Step 3: Verification */}
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold">3</span>
              <h3 className="text-sm font-semibold text-gray-900">Enter the 6-digit code</h3>
            </div>
            <form onSubmit={handleSubmit} className="ml-8 space-y-4">
              <p className="text-sm text-gray-600">
                After adding the account, enter the current code shown in your authenticator app to activate MFA.
              </p>
              <div>
                <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Verification code
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full max-w-xs px-4 py-3 border border-gray-200 rounded-lg text-lg font-mono tracking-[0.4em] text-center placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-colors"
                  placeholder="123456"
                  maxLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Activating MFA…
                  </>
                ) : (
                  'Activate MFA'
                )}
              </button>
            </form>
          </section>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to sign in
          </a>
        </div>
      </motion.div>
    </div>
  )
}