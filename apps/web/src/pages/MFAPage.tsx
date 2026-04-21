import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authClient, type ApiError } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'

const getMfaErrorMessage = (error: unknown) => {
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

  return 'Invalid verification code. Please try again.'
}

export function MFAPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Paste support — distribute chars across inputs
      const chars = value.slice(0, 6).split('')
      const newCode = [...code]
      chars.forEach((char, i) => {
        if (index + i < 6 && /^\d$/.test(char)) {
          newCode[index + i] = char
        }
      })
      setCode(newCode)
      const nextIndex = Math.min(index + chars.length, 5)
      inputRefs.current[nextIndex]?.focus()
      return
    }

    if (value && !/^\d$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fullCode = code.join('')
    if (fullCode.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }
    setError(null)

    setIsLoading(true)
    try {
      const challenge = authFlowStore.getChallenge()
      if (!challenge) {
        setError('Your sign-in session expired. Please sign in again.')
        navigate('/')
        return
      }

      const session = await authClient.verifyMfa(challenge.challengeId, fullCode)
      authFlowStore.clear()
      sessionStore.setAuthenticated(session)
      navigate('/dashboard')
    } catch (err) {
      setError(getMfaErrorMessage(err))
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!authFlowStore.getChallenge()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <span className="text-atlas-gold font-serif font-bold text-lg">A</span>
          </div>
          <span className="text-xl font-serif font-bold text-gray-900 tracking-widest uppercase">
            Atlas
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Two-factor authentication</h2>
          <p className="text-gray-500 text-sm mb-8">
            Enter the current 6-digit code from your registered authenticator app.
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex justify-center gap-2 mb-8">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-11 h-13 p-0 text-center text-xl font-semibold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-colors"
                  style={{ height: '3.25rem' }}
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify code'
              )}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-sm text-gray-600">
            Codes are generated by your authenticator app and refresh automatically every 30 seconds.
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
