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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <span className="text-atlas-gold font-serif font-bold text-lg">A</span>
          </div>
          <span className="text-xl font-serif font-bold text-gray-900 tracking-widest uppercase">
            Atlas
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Set up authenticator MFA</h2>
              <p className="text-sm text-gray-500">
                You must register an authenticator app before entering Atlas.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-[240px_1fr] items-start">
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <img
                src={enrollment.qrCodeDataUrl}
                alt="Scan this QR code with Google Authenticator"
                className="w-full rounded-lg bg-white"
              />
            </div>

            <div className="space-y-4">
              <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
                <li>Open Google Authenticator or another TOTP app.</li>
                <li>Choose to add an account and scan this QR code.</li>
                <li>Enter the first 6-digit code below to activate MFA.</li>
              </ol>

              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Manual entry key
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 break-all">
                    {enrollment.manualEntryKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Verification code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="block w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors"
                    placeholder="123456"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Activating MFA...
                    </>
                  ) : (
                    'Activate MFA'
                  )}
                </button>
              </form>
            </div>
          </div>
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