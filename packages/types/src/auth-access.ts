export type AtlasRole = 'Admin' | 'User'

export type UserStatus = 'Invited' | 'Active' | 'Inactive'

export interface LoginRequest {
  email: string
  password: string
}

export interface MfaChallengeResponse {
  challengeId: string
  status: 'MFA_REQUIRED'
}

export interface MfaVerifyRequest {
  challengeId: string
  code: string
}

export interface UserSummary {
  id: string
  email: string
  role: AtlasRole
  status: UserStatus
}

export interface SessionPayload {
  issuedAt: string
  idleTimeoutSeconds: number
  absoluteTimeoutSeconds: number
}

export interface SessionResponse {
  user: UserSummary
  role: AtlasRole
  session: SessionPayload
}

export interface AuthErrorResponse {
  error: 'SIGN_IN_FAILED'
}

export interface LockoutResponse {
  error: 'ACCOUNT_LOCKED'
  lockoutUntil: string
}

export interface InviteUserRequest {
  email: string
  role: AtlasRole
}

export interface InvitationResponse {
  id: string
  email: string
  role: AtlasRole
  expiresAt: string
  status: 'Invited'
}

export interface RoleChangeRequest {
  role: AtlasRole
}