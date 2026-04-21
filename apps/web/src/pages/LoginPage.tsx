import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authClient, type ApiError } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'

const getLoginErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'error' in error &&
    (error as ApiError).error === 'ACCOUNT_LOCKED'
  ) {
    return 'Your account is temporarily locked. Please wait and try again.'
  }

  if (
    error &&
    typeof error === 'object' &&
    'error' in error &&
    (error as ApiError).error === 'NETWORK_ERROR'
  ) {
    return 'Authentication service is unavailable. Start the API server and try again.'
  }

  return 'Invalid email or password. Please try again.'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }

    setIsLoading(true)
    try {
      const result = await authClient.login(email, password)
      if (result.status === 'MFA_ENROLL_REQUIRED') {
        authFlowStore.setEnrollment(result)
        navigate('/mfa/setup')
        return
      }

      authFlowStore.setChallenge(result)
      navigate('/mfa')
    } catch (err) {
      setError(getLoginErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-atlas-gold rounded-lg flex items-center justify-center">
            <span className="text-black font-serif font-bold text-xl">A</span>
          </div>
          <span className="text-2xl font-serif font-bold text-white tracking-widest uppercase">
            Atlas
          </span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-serif text-white leading-tight mb-6">
            Institutional-grade K-1 processing, built for family offices.
          </h1>
          <p className="text-gray-400 text-lg">
            Manage your partnership investments, tax documents, and reporting from a single unified platform.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-atlas-gold" />
          <span className="text-gray-400 text-sm">SOC 2 Type II Certified</span>
          <div className="w-1.5 h-1.5 rounded-full bg-gray-600 ml-4" />
          <span className="text-gray-400 text-sm">256-bit AES Encryption</span>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-atlas-gold font-serif font-bold text-lg">A</span>
            </div>
            <span className="text-xl font-serif font-bold text-gray-900 tracking-widest uppercase">
              Atlas
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-gray-500 text-sm mb-8">Sign in to your Atlas account</p>

            {error && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me for 30 days
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center px-4 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            &copy; {new Date().getFullYear()} Atlas Capital Management. All rights reserved.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
