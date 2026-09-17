import { authenticatedFetch } from './authenticatedFetch'

export type JacksonRole = 'Admin' | 'User'
export type JacksonAccessLevel = 'SuperAdmin' | JacksonRole
export type UserStatus = 'Invited' | 'Active' | 'Inactive'

export interface UserSummary {
  id: string
  email: string
  displayName: string
  role: JacksonRole
  accessLevel: JacksonAccessLevel
  status: UserStatus
}

export interface SessionResponse {
  user: UserSummary
  role: JacksonRole
  session: {
    issuedAt: string
    idleTimeoutSeconds: number
    absoluteTimeoutSeconds: number
  }
}

export interface ApiError {
  error: 'SIGN_IN_FAILED' | 'ACCOUNT_LOCKED' | 'NETWORK_ERROR'
  lockoutUntil?: string
}

export interface MfaChallengeResponse {
  challengeId: string
  status: 'MFA_REQUIRED'
}

export interface MfaEnrollmentResponse {
  enrollmentToken: string
  status: 'MFA_ENROLL_REQUIRED'
  otpAuthUrl: string
  qrCodeDataUrl: string
  manualEntryKey: string
}

export interface PasswordChangeRequiredResponse {
  changeToken: string
  status: 'PASSWORD_CHANGE_REQUIRED'
  expiresAt: string
  policy: PasswordPolicySummary
}

export interface PasswordPolicySummary {
  minimumCharacters: number
  maximumCharacters: number
  acceptsPassphrases: boolean
  compositionRequired: boolean
}

export type LoginResponse =
  | SessionResponse
  | MfaEnrollmentResponse
  | MfaChallengeResponse
  | PasswordChangeRequiredResponse

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ??
  '/v1'

const request = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  let response: Response
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers,
      ...init,
    })
  } catch {
    throw { error: 'NETWORK_ERROR' as const }
  }

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: 'SIGN_IN_FAILED' as const }))
    throw body
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const authClient = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  changePassword(changeToken: string, newPassword: string) {
    return request<{ status: 'PASSWORD_CHANGED' }>('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ changeToken, newPassword }),
    })
  },

  completeMfaEnrollment(enrollmentToken: string, code: string) {
    return request<SessionResponse>('/auth/mfa/enroll/complete', {
      method: 'POST',
      body: JSON.stringify({ enrollmentToken, code }),
    })
  },

  verifyMfa(challengeId: string, code: string) {
    return request<SessionResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    })
  },

  getSession() {
    return request<SessionResponse>('/auth/session', { method: 'GET' })
  },

  extendSession() {
    return request<SessionResponse>('/auth/session/extend', { method: 'POST' })
  },

  logout() {
    return request<void>('/auth/logout', { method: 'POST' })
  },

}
