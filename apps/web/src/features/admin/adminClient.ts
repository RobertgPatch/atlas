import { authenticatedFetch } from '../../auth/authenticatedFetch'
import type { JacksonAccessLevel, JacksonRole, UserStatus } from '../../auth/authClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/v1'

export interface AdminUserSummary {
  id: string
  email: string
  displayName: string
  role: JacksonRole
  accessLevel: JacksonAccessLevel
  status: UserStatus
  passwordChangeRequired: boolean
  mfaEnrollmentState: 'PENDING' | 'ENROLLED' | 'RESET_REQUIRED'
  createdAt: string
  lastLoginAt: string | null
  loginCount: number
}

export interface ApplicationLogEvent {
  id: string
  source: string
  timestamp: string
  ingestedAt: string | null
  message: string
}

export interface ApplicationLogResult {
  available: boolean
  source: 'cloudwatch' | 'unavailable'
  events: ApplicationLogEvent[]
  failures: string[]
  checkedAt: string
  refreshAfterSeconds: number
}

const get = async <T>(path: string): Promise<T> => {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(response.status === 403 ? 'SUPER_ADMIN_REQUIRED' : 'ADMIN_REQUEST_FAILED')
  }
  return response.json() as Promise<T>
}

export const adminClient = {
  listUsers: () => get<{ users: AdminUserSummary[]; checkedAt: string }>('/admin/users'),
  listApplicationLogs: (sinceMinutes = 15, limit = 100) =>
    get<ApplicationLogResult>(`/admin/application-logs?sinceMinutes=${sinceMinutes}&limit=${limit}`),
}
