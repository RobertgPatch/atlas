import { pool } from '../infra/db/client.js'
import { authRepository } from '../modules/auth/auth.repository.js'

if (!pool) {
  throw new Error('Identity reconciliation requires durable PostgreSQL persistence.')
}

try {
  await authRepository.bootstrapFromDatabase()
  await authRepository._flushPersistenceWrites()
  const result = await pool.query<{
    email: string
    display_name: string
    access_level: string
    password_change_required: boolean
    bootstrap_password_reset_pending: boolean
  }>(`
    select
      u.email,
      u.display_name,
      r.name as access_level,
      u.password_change_required,
      u.bootstrap_password_reset_pending
    from users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id
    where lower(u.email) in (
      'tpatch@jspllc.com', 'rpatch@jspllc.com',
      'admin@atlas.com', 'admin@jackson.com'
    )
  `)
  const expected = new Map([
    ['tpatch@jspllc.com', { displayName: 'Tony Patch', accessLevel: 'Admin' }],
    ['rpatch@jspllc.com', { displayName: 'Robert Patch', accessLevel: 'SuperAdmin' }],
  ])
  if (result.rows.length !== 2 || result.rows.some((row) => {
    const identity = expected.get(row.email.toLowerCase())
    return !identity
      || row.display_name !== identity.displayName
      || row.access_level !== identity.accessLevel
      || !row.password_change_required
      || row.bootstrap_password_reset_pending
  })) {
    throw new Error('Canonical bootstrap identity verification failed.')
  }
  console.info('[identity] Tony Patch and Robert Patch bootstrap identities reconciled.')
} finally {
  await pool.end()
}
