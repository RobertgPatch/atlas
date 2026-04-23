export type AtlasRole = 'Admin' | 'User'
export type UserStatus = 'Invited' | 'Active' | 'Inactive'

export interface UserSummary {
  id: string
  email: string
  role: AtlasRole
  status: UserStatus
}

export interface SessionResponse {
  user: UserSummary
  role: AtlasRole
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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ??
  '/v1'

const request = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
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
    return request<MfaChallengeResponse | MfaEnrollmentResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    )
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

  logout() {
    return request<void>('/auth/logout', { method: 'POST' })
  },

  listUsers() {
    return request<{ items: UserSummary[] }>('/admin/users', { method: 'GET' })
  },

  inviteUser(email: string, role: AtlasRole) {
    return request<{
      id: string
      email: string
      role: AtlasRole
      expiresAt: string
      status: 'Invited'
    }>('/admin/users/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    })
  },

  changeRole(userId: string, role: AtlasRole) {
    return request<UserSummary>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  deactivateUser(userId: string) {
    return request<UserSummary>(`/admin/users/${userId}/deactivate`, {
      method: 'POST',
    })
  },

  reactivateUser(userId: string) {
    return request<UserSummary>(`/admin/users/${userId}/reactivate`, {
      method: 'POST',
    })
  },

  resetMfa(userId: string) {
    return request<UserSummary>(`/admin/users/${userId}/mfa-reset`, {
      method: 'POST',
    })
  },
}
