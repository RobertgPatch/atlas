import { createHash, randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { pool } from '../../infra/db/client.js'
import { decryptSecret, encryptSecret } from '../../infra/crypto/secretCodec.js'

export type Role = 'Admin' | 'User'
export type UserStatus = 'Invited' | 'Active' | 'Inactive'
export type MfaEnrollmentState = 'PENDING' | 'ENROLLED' | 'RESET_REQUIRED'

export interface UserRecord {
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

export interface SessionRecord {
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

interface UserRow {
  id: string
  email: string
  password_hash: string
  role: Role | null
  status: UserStatus | null
  is_active: boolean
  created_at: Date
  last_login_at: Date | null
  login_count: number | null
  totp_secret_encrypted: string | null
  enrollment_state: MfaEnrollmentState | null
}

interface SessionRow {
  id: string
  session_token_hash: string
  user_id: string
  issued_at: Date
  last_activity_at: Date
  expires_at: Date
  revoked_at: Date | null
  revoke_reason: string | null
}

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const now = () => new Date()

const users = new Map<string, UserRecord>()
const sessions = new Map<string, SessionRecord>()
const challenges = new Map<string, MfaChallengeRecord>()
const enrollments = new Map<string, MfaEnrollmentRecord>()

let dbWriteQueue = Promise.resolve()

const enqueueDbWrite = (task: () => Promise<void>) => {
  if (!pool) return
  dbWriteQueue = dbWriteQueue
    .then(task)
    .catch((error) => {
      console.error('[persistence] auth write failed', error)
    })
}

const mapUserRow = (row: UserRow): UserRecord => {
  let mfaSecret: string | null = null
  if (row.totp_secret_encrypted) {
    try {
      mfaSecret = decryptSecret(row.totp_secret_encrypted)
    } catch {
      mfaSecret = null
    }
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role ?? 'User',
    status: row.status ?? (row.is_active ? 'Active' : 'Inactive'),
    mfaSecret,
    mfaEnrollmentState: row.enrollment_state ?? 'RESET_REQUIRED',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    loginCount: row.login_count ?? 0,
  }
}

const mapSessionRow = (row: SessionRow): SessionRecord => ({
  id: row.id,
  tokenHash: row.session_token_hash,
  userId: row.user_id,
  issuedAt: row.issued_at,
  lastActivityAt: row.last_activity_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at ?? undefined,
  revokeReason: row.revoke_reason ?? undefined,
})

const seedInMemoryUsers = () => {
  if (users.size > 0) return

  const adminId = randomUUID()
  users.set(adminId, {
    id: adminId,
    email: 'admin@atlas.com',
    passwordHash: hash(config.adminPassword),
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
    passwordHash: hash(config.userPassword),
    role: 'User',
    status: 'Active',
    mfaSecret: null,
    mfaEnrollmentState: 'RESET_REQUIRED',
    createdAt: now(),
    lastLoginAt: null,
    loginCount: 0,
  })
}

const userSelectSql = `
  select
    u.id,
    u.email,
    u.password_hash,
    coalesce(
      (
        select r.name
        from user_roles ur
        join roles r on r.id = ur.role_id
        where ur.user_id = u.id
        order by case when r.name = 'Admin' then 0 else 1 end
        limit 1
      ),
      'User'
    )::text as role,
    u.status,
    u.is_active,
    u.created_at,
    u.last_login_at,
    u.login_count,
    m.totp_secret_encrypted,
    m.enrollment_state
  from users u
  left join user_mfa_enrollments m on m.user_id = u.id
`

const upsertSeedUser = async (email: string, password: string, role: Role) => {
  if (!pool) return

  const userResult = await pool.query<{ id: string }>(
    `
      insert into users (id, email, password_hash, mfa_enabled, is_active, status)
      values ($1, $2, $3, false, true, 'Active')
      on conflict (email) do update
      set updated_at = now()
      returning id
    `,
    [randomUUID(), email, hash(password)],
  )
  const userId = userResult.rows[0]?.id
  if (!userId) return

  await pool.query(
    `
      insert into user_roles (id, user_id, role_id)
      select gen_random_uuid(), $1, id from roles where name = $2
      on conflict do nothing
    `,
    [userId, role],
  )
}

const loadUsersFromDatabase = async () => {
  if (!pool) return
  const result = await pool.query<UserRow>(`${userSelectSql} order by u.created_at`)
  users.clear()
  for (const row of result.rows) {
    const user = mapUserRow(row)
    users.set(user.id, user)
  }
}

const loadSessionsFromDatabase = async () => {
  if (!pool) return
  const result = await pool.query<SessionRow>(
    `
      select id, session_token_hash, user_id, issued_at, last_activity_at, expires_at,
        revoked_at, revoke_reason
      from auth_sessions
      where expires_at > now()
    `,
  )
  sessions.clear()
  for (const row of result.rows) {
    const session = mapSessionRow(row)
    sessions.set(session.id, session)
  }
}

const persistSession = (session: SessionRecord) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        insert into auth_sessions (
          id, user_id, session_token_hash, issued_at, last_activity_at, expires_at,
          revoked_at, revoke_reason
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update
        set last_activity_at = excluded.last_activity_at,
            revoked_at = excluded.revoked_at,
            revoke_reason = excluded.revoke_reason
      `,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.issuedAt,
        session.lastActivityAt,
        session.expiresAt,
        session.revokedAt ?? null,
        session.revokeReason ?? null,
      ],
    )
  })
}

const persistUser = (user: UserRecord) => {
  enqueueDbWrite(async () => {
    const userResult = await pool!.query<{ id: string }>(
      `
        insert into users (
          id, email, password_hash, mfa_enabled, is_active, status,
          created_at, last_login_at, login_count, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        on conflict (id) do update
        set email = excluded.email,
            password_hash = excluded.password_hash,
            mfa_enabled = excluded.mfa_enabled,
            is_active = excluded.is_active,
            status = excluded.status,
            last_login_at = excluded.last_login_at,
            login_count = excluded.login_count,
            updated_at = now()
        returning id
      `,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.mfaEnrollmentState === 'ENROLLED' && Boolean(user.mfaSecret),
        user.status !== 'Inactive',
        user.status,
        user.createdAt,
        user.lastLoginAt,
        user.loginCount,
      ],
    )

    await pool!.query(
      `
        delete from user_roles
        where user_id = $1
          and role_id not in (select id from roles where name = $2)
      `,
      [userResult.rows[0]!.id, user.role],
    )
    await pool!.query(
      `
        insert into user_roles (id, user_id, role_id)
        select gen_random_uuid(), $1, id from roles where name = $2
        on conflict do nothing
      `,
      [userResult.rows[0]!.id, user.role],
    )
  })
}

const persistMfaEnrollment = (user: UserRecord) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        insert into user_mfa_enrollments (
          user_id, totp_secret_encrypted, enrollment_state, enrolled_at, reset_at, updated_at
        )
        values ($1, $2, $3, $4, $5, now())
        on conflict (user_id) do update
        set totp_secret_encrypted = excluded.totp_secret_encrypted,
            enrollment_state = excluded.enrollment_state,
            enrolled_at = excluded.enrolled_at,
            reset_at = excluded.reset_at,
            updated_at = now()
      `,
      [
        user.id,
        encryptSecret(user.mfaSecret ?? ''),
        user.mfaEnrollmentState,
        user.mfaEnrollmentState === 'ENROLLED' ? now() : null,
        user.mfaEnrollmentState === 'RESET_REQUIRED' ? now() : null,
      ],
    )
  })
}

if (!pool) {
  seedInMemoryUsers()
}

export const authRepository = {
  async bootstrapFromDatabase(): Promise<void> {
    if (!pool) {
      seedInMemoryUsers()
      return
    }

    await pool.query(`
      insert into roles (id, name)
      values (gen_random_uuid(), 'Admin'), (gen_random_uuid(), 'User')
      on conflict (name) do nothing
    `)
    await upsertSeedUser('admin@atlas.com', config.adminPassword, 'Admin')
    await upsertSeedUser('user@atlas.com', config.userPassword, 'User')
    await loadUsersFromDatabase()
    await loadSessionsFromDatabase()
  },

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
    persistSession(session)

    const user = users.get(userId)
    if (user) {
      user.lastLoginAt = issuedAt
      user.loginCount += 1
      users.set(userId, user)
      persistUser(user)
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
    persistSession(session)
  },

  revokeSession(sessionId: string, reason: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    session.revokedAt = now()
    session.revokeReason = reason
    sessions.set(sessionId, session)
    persistSession(session)
  },

  revokeAllUserSessions(userId: string, reason: string): void {
    for (const session of sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now()
        session.revokeReason = reason
        sessions.set(session.id, session)
        persistSession(session)
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
    persistUser(user)
    persistMfaEnrollment(user)
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
    persistUser(user)
    return user
  },

  updateUserStatus(userId: string, status: UserStatus): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.status = status
    users.set(userId, user)
    persistUser(user)
    return user
  },

  resetUserMfa(userId: string): UserRecord | undefined {
    const user = users.get(userId)
    if (!user) return undefined
    user.mfaSecret = null
    user.mfaEnrollmentState = 'RESET_REQUIRED'
    users.set(userId, user)
    persistUser(user)
    persistMfaEnrollment(user)
    return user
  },

  upsertInvitedUser(email: string, role: Role): UserRecord {
    const existing = this.findUserByEmail(email)
    if (existing) {
      existing.role = role
      existing.status = 'Invited'
      users.set(existing.id, existing)
      persistUser(existing)
      return existing
    }

    const user: UserRecord = {
      id: randomUUID(),
      email,
      passwordHash: hash(config.userPassword),
      role,
      status: 'Invited',
      mfaSecret: null,
      mfaEnrollmentState: 'PENDING',
      createdAt: now(),
      lastLoginAt: null,
      loginCount: 0,
    }
    users.set(user.id, user)
    persistUser(user)
    return user
  },

  async _flushPersistenceWrites(): Promise<void> {
    await dbWriteQueue
  },
}
