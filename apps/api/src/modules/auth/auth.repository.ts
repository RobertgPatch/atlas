import { createHash, randomUUID } from 'node:crypto'
import { config } from '../../config.js'

export type Role = 'Admin' | 'User'
export type UserStatus = 'Invited' | 'Active' | 'Inactive'
export type MfaEnrollmentState = 'PENDING' | 'ENROLLED' | 'RESET_REQUIRED'

interface UserRecord {
  id: string
  email: string
  passwordHash: string
  role: Role
  status: UserStatus
  mfaSecret: string | null
  mfaEnrollmentState: MfaEnrollmentState
  createdAt: Date
  lastLoginAt: Date | null
  loginCount: number
}

interface SessionRecord {
  id: string
  tokenHash: string
  userId: string
  issuedAt: Date
  lastActivityAt: Date
  expiresAt: Date
  revokedAt?: Date
  revokeReason?: string
}

interface MfaChallengeRecord {
  id: string
  userId: string
  createdAt: Date
}

interface MfaEnrollmentRecord {
  id: string
  userId: string
  secret: string
  createdAt: Date
}

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const now = () => new Date()

const users = new Map<string, UserRecord>()
const sessions = new Map<string, SessionRecord>()
const challenges = new Map<string, MfaChallengeRecord>()
const enrollments = new Map<string, MfaEnrollmentRecord>()

const seedUsers = () => {
  if (users.size > 0) return

  const adminId = randomUUID()
  users.set(adminId, {
    id: adminId,
    email: 'admin@atlas.com',
    passwordHash: hash('password123'),
    role: 'Admin',
    status: 'Active',
    mfaSecret: null,
    mfaEnrollmentState: 'RESET_REQUIRED',
    createdAt: now(),
    lastLoginAt: null,
    loginCount: 0,
  })

  const userId = randomUUID()
  users.set(userId, {
    id: userId,
    email: 'user@atlas.com',
    passwordHash: hash('password123'),
    role: 'User',
    status: 'Active',
    mfaSecret: null,
    mfaEnrollmentState: 'RESET_REQUIRED',
    createdAt: now(),
    lastLoginAt: null,
    loginCount: 0,
  })
}

seedUsers()

export const authRepository = {
  findUserByEmail(email: string): UserRecord | undefined {
    const lower = email.toLowerCase()
    return [...users.values()].find((user) => user.email.toLowerCase() === lower)
  },

  verifyPassword(user: UserRecord, password: string): boolean {
    return user.passwordHash === hash(password)
  },

  createMfaChallenge(userId: string): MfaChallengeRecord {
    const challenge: MfaChallengeRecord = {
      id: randomUUID(),
      userId,
      createdAt: now(),
    }
    challenges.set(challenge.id, challenge)
    return challenge
  },

  createMfaEnrollment(userId: string, secret: string): MfaEnrollmentRecord {
    for (const existing of enrollments.values()) {
      if (existing.userId === userId) {
        enrollments.delete(existing.id)
      }
    }

    const enrollment: MfaEnrollmentRecord = {
      id: randomUUID(),
      userId,
      secret,
      createdAt: now(),
    }
    enrollments.set(enrollment.id, enrollment)
    return enrollment
  },

  getChallenge(challengeId: string): MfaChallengeRecord | undefined {
    return challenges.get(challengeId)
  },

  consumeChallenge(challengeId: string): MfaChallengeRecord | undefined {
    const challenge = challenges.get(challengeId)
    if (!challenge) return undefined
    challenges.delete(challengeId)
    return challenge
  },

  getMfaEnrollment(enrollmentId: string): MfaEnrollmentRecord | undefined {
    return enrollments.get(enrollmentId)
  },

  consumeMfaEnrollment(enrollmentId: string): MfaEnrollmentRecord | undefined {
    const enrollment = enrollments.get(enrollmentId)
    if (!enrollment) return undefined
    enrollments.delete(enrollmentId)
    return enrollment
  },

  createSession(userId: string): { token: string; session: SessionRecord } {
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    const issuedAt = now()
    const session: SessionRecord = {
      id: randomUUID(),
      tokenHash: hash(token),
      userId,
      issuedAt,
      lastActivityAt: issuedAt,
      expiresAt: new Date(
        issuedAt.getTime() + config.sessionAbsoluteTimeoutSeconds * 1000,
      ),
    }
    sessions.set(session.id, session)

    const user = users.get(userId)
    if (user) {
      user.lastLoginAt = issuedAt
      user.loginCount += 1
      users.set(userId, user)
    }

    return { token, session }
  },

  getSessionByToken(token: string): SessionRecord | undefined {
    const tokenHash = hash(token)
    return [...sessions.values()].find((session) => session.tokenHash === tokenHash)
  },

  touchSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    session.lastActivityAt = now()
    sessions.set(sessionId, session)
  },

  revokeSession(sessionId: string, reason: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    session.revokedAt = now()
    session.revokeReason = reason
    sessions.set(sessionId, session)
  },

  revokeAllUserSessions(userId: string, reason: string): void {
    for (const session of sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now()
        session.revokeReason = reason
        sessions.set(session.id, session)
      }
    }
  },

  isSessionValid(session: SessionRecord): boolean {
    if (session.revokedAt) return false
    const current = now().getTime()
    if (session.expiresAt.getTime() <= current) return false

    const idleLimit = session.lastActivityAt.getTime() + config.sessionIdleTimeoutSeconds * 1000
    return idleLimit > current
  },

  getUserById(userId: string): UserRecord | undefined {
    return users.get(userId)
  },

  isMfaEnrollmentRequired(user: UserRecord): boolean {
    return user.mfaEnrollmentState !== 'ENROLLED' || !user.mfaSecret
  },

  completeMfaEnrollment(userId: string, secret: string): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.mfaSecret = secret
    user.mfaEnrollmentState = 'ENROLLED'
    users.set(userId, user)
    return user
  },

  listUsers(): UserRecord[] {
    return [...users.values()]
  },

  updateUserRole(userId: string, role: Role): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.role = role
    users.set(userId, user)
    return user
  },

  updateUserStatus(userId: string, status: UserStatus): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.status = status
    users.set(userId, user)
    return user
  },

  resetUserMfa(userId: string): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.mfaSecret = null
    user.mfaEnrollmentState = 'RESET_REQUIRED'
    users.set(userId, user)
    return user
  },

  upsertInvitedUser(email: string, role: Role): UserRecord {
    const existing = this.findUserByEmail(email)
    if (existing) {
      existing.role = role
      existing.status = 'Invited'
      users.set(existing.id, existing)
      return existing
    }

    const user: UserRecord = {
      id: randomUUID(),
      email,
      passwordHash: hash('password123'),
      role,
      status: 'Invited',
      mfaSecret: null,
      mfaEnrollmentState: 'PENDING',
      createdAt: now(),
      lastLoginAt: null,
      loginCount: 0,
    }
    users.set(user.id, user)
    return user
  },
}
