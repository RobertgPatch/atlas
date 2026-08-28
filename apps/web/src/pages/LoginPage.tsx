import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient, type ApiError } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'
import { MagicPatternLoginPage } from './magic-patterns/MagicPatternLoginPage'

const getLoginErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'error' in error) {
    if ((error as ApiError).error === 'ACCOUNT_LOCKED') {
      return 'Your account is temporarily locked. Please wait and try again.'
    }
    if ((error as ApiError).error === 'NETWORK_ERROR') {
      return 'Authentication service is unavailable. Start the API server and try again.'
    }
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }

    setIsLoading(true)
    try {
      const result = await authClient.login(email, password)
      if ('status' in result && result.status === 'MFA_ENROLL_REQUIRED') {
        authFlowStore.setEnrollment(result)
        navigate('/mfa/setup')
        return
      }
      if ('status' in result && result.status === 'MFA_REQUIRED') {
        authFlowStore.setChallenge(result)
        navigate('/mfa')
        return
      }

      authFlowStore.clear()
      sessionStore.setAuthenticated(result)
      navigate('/dashboard')
    } catch (caught) {
      setError(getLoginErrorMessage(caught))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <MagicPatternLoginPage
      email={email}
      password={password}
      rememberMe={rememberMe}
      showPassword={showPassword}
      isLoading={isLoading}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onRememberMeChange={setRememberMe}
      onTogglePassword={() => setShowPassword((visible) => !visible)}
      onSubmit={handleSubmit}
    />
  )
}
