import { createHash, randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { pool } from '../../infra/db/client.js'
import { decryptSecret, encryptSecret } from '../../infra/crypto/secretCodec.js'
import { passwordService } from './password.service.js'

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
  expiresAt: Date
}

interface MfaEnrollmentRecord {
  id: string
  userId: string
  secret: string
  createdAt: Date
  expiresAt: Date
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

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const now = () => new Date()

const users = new Map<string, UserRecord>()
const sessions = new Map<string, SessionRecord>()
const persistedSessionActivity = new Map<string, Date>()
const challenges = new Map<string, MfaChallengeRecord>()
const enrollments = new Map<string, MfaEnrollmentRecord>()

const cleanupMfaArtifacts = (at = now()): void => {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= at) challenges.delete(id)
  }
  for (const [id, enrollment] of enrollments) {
    if (enrollment.expiresAt <= at) enrollments.delete(id)
  }
}

const evictOldest = <T extends { createdAt: Date }>(
  records: Map<string, T>,
  maximum: number,
): void => {
  while (records.size >= maximum) {
    let oldest: [string, T] | undefined
    for (const entry of records) {
      if (!oldest || entry[1].createdAt < oldest[1].createdAt) oldest = entry
    }
    if (!oldest) return
    records.delete(oldest[0])
  }
}

let dummyPasswordHashPromise: Promise<string> | undefined

const getDummyPasswordHash = () => {
  dummyPasswordHashPromise ??= passwordService.hash(randomUUID())
  return dummyPasswordHashPromise
}

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
    email: config.adminEmail,
    // Kept only for synchronous module seeding. bootstrapFromDatabase replaces
    // these legacy values with Argon2id before the server accepts requests.
    passwordHash: sha256(config.adminPassword),
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
    email: config.userEmail,
    passwordHash: sha256(config.userPassword),
    role: 'User',
    status: 'Active',
    mfaSecret: null,
    mfaEnrollmentState: 'RESET_REQUIRED',
    createdAt: now(),
    lastLoginAt: null,
    loginCount: 0,
  })
}

const upgradeInMemorySeedPasswords = async () => {
  const credentials = [
    [config.adminEmail, config.adminPassword],
    [config.userEmail, config.userPassword],
  ] as const

  for (const [email, password] of credentials) {
    const user = [...users.values()].find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
    )
    if (!user || !passwordService.isLegacyHash(user.passwordHash)) continue
    user.passwordHash = await passwordService.hash(password)
    users.set(user.id, user)
  }
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

  const passwordHash = await passwordService.hash(password)

  const userResult = await pool.query<{ id: string }>(
    `
      insert into users (id, email, password_hash, mfa_enabled, is_active, status)
      values ($1, $2, $3, false, true, 'Active')
      on conflict (email) do update
      set updated_at = now()
      returning id
    `,
    [randomUUID(), email, passwordHash],
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
  persistedSessionActivity.clear()
  for (const row of result.rows) {
    const session = mapSessionRow(row)
    sessions.set(session.id, session)
    persistedSessionActivity.set(session.id, new Date(session.lastActivityAt))
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

const persistPasswordHash = async (user: UserRecord) => {
  if (!pool) return
  await pool.query(
    `update users
     set password_hash = $2,
         updated_at = now()
     where id = $1`,
    [user.id, user.passwordHash],
  )
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
      await upgradeInMemorySeedPasswords()
      await getDummyPasswordHash()
      return
    }

    await pool.query(`
      insert into roles (id, name)
      values (gen_random_uuid(), 'Admin'), (gen_random_uuid(), 'User')
      on conflict (name) do nothing
    `)
    await upsertSeedUser(config.adminEmail, config.adminPassword, 'Admin')
    await upsertSeedUser(config.userEmail, config.userPassword, 'User')
    await loadUsersFromDatabase()
    await loadSessionsFromDatabase()
    await getDummyPasswordHash()
  },

  findUserByEmail(email: string): UserRecord | undefined {
    const lower = email.toLowerCase()
    return [...users.values()].find((user) => user.email.toLowerCase() === lower)
  },

  async verifyPassword(user: UserRecord | undefined, password: string): Promise<boolean> {
    const passwordHash = user?.passwordHash ?? await getDummyPasswordHash()
    const legacyOrUnsupported =
      passwordService.isLegacyHash(passwordHash) || !passwordHash.startsWith('$argon2id$')
    const verification = await passwordService.verify(passwordHash, password)

    // Keep missing, malformed, and legacy records on roughly the same expensive
    // path as Argon2id records to reduce timing-based account enumeration.
    if (legacyOrUnsupported) {
      await passwordService.verify(await getDummyPasswordHash(), password)
    }

    if (!user || !verification.valid) return false

    if (verification.needsUpgrade && user.status !== 'Inactive') {
      user.passwordHash = await passwordService.hash(password)
      users.set(user.id, user)
      await persistPasswordHash(user)
    }

    return true
  },

  createMfaChallenge(userId: string): MfaChallengeRecord {
    const createdAt = now()
    cleanupMfaArtifacts(createdAt)
    for (const existing of challenges.values()) {
      if (existing.userId === userId) challenges.delete(existing.id)
    }
    evictOldest(challenges, config.abuseProtection.authArtifacts.maximumChallenges)
    const challenge: MfaChallengeRecord = {
      id: randomUUID(),
      userId,
      createdAt,
      expiresAt: new Date(
        createdAt.getTime() + config.abuseProtection.authArtifacts.challengeTtlSeconds * 1_000,
      ),
    }
    challenges.set(challenge.id, challenge)
    return challenge
  },

  createMfaEnrollment(userId: string, secret: string): MfaEnrollmentRecord {
    const createdAt = now()
    cleanupMfaArtifacts(createdAt)
    for (const existing of enrollments.values()) {
      if (existing.userId === userId) {
        enrollments.delete(existing.id)
      }
    }
    evictOldest(enrollments, config.abuseProtection.authArtifacts.maximumEnrollments)

    const enrollment: MfaEnrollmentRecord = {
      id: randomUUID(),
      userId,
      secret,
      createdAt,
      expiresAt: new Date(
        createdAt.getTime() + config.abuseProtection.authArtifacts.enrollmentTtlSeconds * 1_000,
      ),
    }
    enrollments.set(enrollment.id, enrollment)
    return enrollment
  },

  getChallenge(challengeId: string): MfaChallengeRecord | undefined {
    cleanupMfaArtifacts()
    return challenges.get(challengeId)
  },

  consumeChallenge(challengeId: string): MfaChallengeRecord | undefined {
    const challenge = this.getChallenge(challengeId)
    if (!challenge) return undefined
    challenges.delete(challengeId)
    return challenge
  },

  getMfaEnrollment(enrollmentId: string): MfaEnrollmentRecord | undefined {
    cleanupMfaArtifacts()
    return enrollments.get(enrollmentId)
  },

  consumeMfaEnrollment(enrollmentId: string): MfaEnrollmentRecord | undefined {
    const enrollment = this.getMfaEnrollment(enrollmentId)
    if (!enrollment) return undefined
    enrollments.delete(enrollmentId)
    return enrollment
  },

  createSession(userId: string): { token: string; session: SessionRecord } {
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    const issuedAt = now()
    const session: SessionRecord = {
      id: randomUUID(),
      tokenHash: sha256(token),
      userId,
      issuedAt,
      lastActivityAt: issuedAt,
      expiresAt: new Date(
        issuedAt.getTime() + config.sessionAbsoluteTimeoutSeconds * 1000,
      ),
    }
    sessions.set(session.id, session)
    persistedSessionActivity.set(session.id, new Date(session.lastActivityAt))
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
    const tokenHash = sha256(token)
    return [...sessions.values()].find((session) => session.tokenHash === tokenHash)
  },

  touchSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    const touchedAt = now()
    const lastPersisted = persistedSessionActivity.get(sessionId) ?? session.lastActivityAt
    session.lastActivityAt = touchedAt
    sessions.set(sessionId, session)
    const writeIntervalMs = Math.max(
      1,
      config.sessionActivityWriteIntervalSeconds,
    ) * 1_000
    if (touchedAt.getTime() - lastPersisted.getTime() >= writeIntervalMs) {
      persistedSessionActivity.set(sessionId, new Date(touchedAt))
      persistSession(session)
    }
  },

  async cleanupAuthAttempts(maximumRows = config.abuseProtection.retention.cleanupBatchSize): Promise<number> {
    if (!pool) return 0
    const result = await pool.query(
      `with candidates as (
         select id from auth_attempts
          where attempted_at < now() - ($1::integer * interval '1 day')
          order by attempted_at, id
          limit $2
       )
       delete from auth_attempts target using candidates
        where target.id = candidates.id`,
      [config.abuseProtection.retention.authAttemptDays, maximumRows],
    )
    return result.rowCount ?? 0
  },

  revokeSession(sessionId: string, reason: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    session.revokedAt = now()
    session.revokeReason = reason
    sessions.set(sessionId, session)
    persistedSessionActivity.set(sessionId, new Date(session.lastActivityAt))
    persistSession(session)
  },

  revokeAllUserSessions(userId: string, reason: string): void {
    for (const session of sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now()
        session.revokeReason = reason
        sessions.set(session.id, session)
        persistedSessionActivity.set(session.id, new Date(session.lastActivityAt))
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

  async upsertInvitedUser(email: string, role: Role): Promise<UserRecord> {
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
      passwordHash: await passwordService.hash(config.userPassword),
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

  _debugMfaArtifactCounts(): { challenges: number; enrollments: number } {
    cleanupMfaArtifacts()
    return { challenges: challenges.size, enrollments: enrollments.size }
  },
}
