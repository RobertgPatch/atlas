import { buildApp } from '../../src/app.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { k1Repository } from '../../src/modules/k1/k1.repository.js'
import { auditRepository } from '../../src/modules/audit/audit.repository.js'
import { config } from '../../src/config.js'
import type { FastifyInstance } from 'fastify'

export interface TestFixture {
  app: FastifyInstance
  user: { id: string; email: string; role: 'Admin' | 'User' }
  admin: { id: string; email: string; role: 'Admin' | 'User' }
  token: string
  cookie: string
  entityIds: string[]
  entities: Array<{ id: string; name: string }>
  partnerships: Array<{ id: string; name: string; entityId: string }>
}

/**
 * Build a fresh Fastify app with clean repository state and an authenticated
 * admin session cookie ready to attach to requests.
 */
export const createTestFixture = async (): Promise<TestFixture> => {
  k1Repository._debugReset()
  // Clear in-memory audit buffer between tests so each test can assert a
  // clean slate of events it caused.
  const inMemory = auditRepository.getInMemoryEvents()
  inMemory.length = 0

  const users = authRepository.listUsers()
  const admin = users.find((u) => u.role === 'Admin')!
  const user = users.find((u) => u.role === 'User')!

  const { token } = authRepository.createSession(admin.id)
  const cookie = `${config.sessionCookieName}=${token}`

  const entities = k1Repository.listEntities().map((e) => ({ id: e.id, name: e.name }))
  const partnerships = k1Repository
    .listPartnerships()
    .map((p) => ({ id: p.id, name: p.name, entityId: p.entityId }))

  const app = buildApp()
  await app.ready()

  return {
    app,
    user: { id: user.id, email: user.email, role: user.role },
    admin: { id: admin.id, email: admin.email, role: admin.role },
    token,
    cookie,
    entityIds: entities.map((e) => e.id),
    entities,
    partnerships,
  }
}

export const sessionCookieFor = (userId: string): string => {
  const { token } = authRepository.createSession(userId)
  return `${config.sessionCookieName}=${token}`
}
