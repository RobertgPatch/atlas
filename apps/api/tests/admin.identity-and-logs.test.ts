import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { applicationLogsService, redactApplicationLogMessage } from '../src/modules/admin/applicationLogs.service.js'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

describe('super-admin operations APIs', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => fixture.app.close())

  it('keeps the identity directory Robert-only and returns sanitized identity metadata', async () => {
    const tony = authRepository.listUsers().find((user) => user.displayName === 'Tony Patch')!
    const robert = authRepository.listUsers().find((user) => user.accessLevel === 'SuperAdmin')!

    const forbidden = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { cookie: sessionCookieFor(tony.id) },
    })
    expect(forbidden.statusCode).toBe(403)

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { cookie: sessionCookieFor(robert.id) },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().users).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: 'tpatch@jspllc.com', displayName: 'Tony Patch', accessLevel: 'Admin' }),
      expect.objectContaining({ email: 'rpatch@jspllc.com', displayName: 'Robert Patch', accessLevel: 'SuperAdmin' }),
    ]))
    expect(JSON.stringify(response.json())).not.toContain('passwordHash')
  })
})

describe('bounded CloudWatch application log reads', () => {
  it('queries each exact group once, bounds results, and redacts credentials and PII', async () => {
    const commands: unknown[] = []
    const result = await applicationLogsService.list({
      enabled: true,
      logGroups: ['/aws/ecs/atlas/api', '/aws/ecs/atlas/k1-worker'],
      now: new Date('2026-08-30T12:00:00.000Z'),
      sinceMinutes: 15,
      limit: 2,
      client: {
        async send(command) {
          commands.push(command)
          return { events: [
            { eventId: `event-${commands.length}`, timestamp: Date.parse('2026-08-30T11:59:00.000Z'), message: '{"email":"tony@example.com","authorization":"Bearer secret","message":"ok"}' },
            { eventId: `older-${commands.length}`, timestamp: Date.parse('2026-08-30T11:58:00.000Z'), message: 'request from 192.168.1.20' },
          ] }
        },
      },
    })

    expect(commands).toHaveLength(2)
    expect(result.events).toHaveLength(2)
    expect(result.events.every((event) => !event.message.includes('tony@example.com'))).toBe(true)
    expect(result.events.every((event) => !event.message.includes('Bearer secret'))).toBe(true)
    expect(redactApplicationLogMessage('cookie atlas_session=secret')).not.toContain('secret')
  })
})
