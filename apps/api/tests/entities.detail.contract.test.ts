import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

// T040 — Contract: GET /v1/entities/:id (entity detail)
// Asserts response shape (entity + partnerships[] + rollup), scope enforcement.
describe('GET /v1/entities/:id — entity detail contract (T040)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for non-uuid id param', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for a valid UUID that does not exist (no DB)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('ENTITY_NOT_FOUND')
  })

  it('non-Admin gets 403 when requesting an entity not in their scope', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    // user has empty scope (no DB → no memberships)
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/entities/${f.entityIds[0]}`,
      headers: { cookie: userCookie },
    })
    // With no DB, user has empty entityIds scope → 403
    expect(res.statusCode).toBe(403)
  })
})

const durable = pool ? describe : describe.skip
durable('PATCH /v1/entities/:id database-backed owner rename', () => {
  let f: TestFixture
  let entityIds: string[]

  beforeEach(async () => {
    f = await createTestFixture()
    entityIds = [randomUUID(), randomUUID()]
    await pool!.query(
      `insert into entities (id, name, entity_type) values
       ($1, $2, 'TRUST'), ($3, $4, 'TRUST')`,
      [entityIds[0], `Rename Source ${entityIds[0]!.slice(0, 8)}`, entityIds[1], `Rename Target ${entityIds[1]!.slice(0, 8)}`],
    )
  })

  afterEach(async () => {
    await pool!.query('delete from audit_events where object_id = any($1::uuid[])', [entityIds])
    await pool!.query('delete from entity_memberships where entity_id = any($1::uuid[])', [entityIds])
    await pool!.query('delete from entities where id = any($1::uuid[])', [entityIds])
    await f.app.close()
  })

  it('renames the canonical owner, records before/after audit data, and reads it back immediately', async () => {
    const response = await f.app.inject({
      method: 'PATCH',
      url: `/v1/entities/${entityIds[0]}`,
      headers: { cookie: f.cookie },
      payload: { name: '  Renamed Canonical Owner  ' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: entityIds[0], name: 'Renamed Canonical Owner' })

    const detail = await f.app.inject({ method: 'GET', url: `/v1/entities/${entityIds[0]}`, headers: { cookie: f.cookie } })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().entity).toMatchObject({ id: entityIds[0], name: 'Renamed Canonical Owner' })

    const audit = (await pool!.query<{ before_json: { name: string }; after_json: { name: string } }>(
      `select before_json, after_json from audit_events
       where object_id = $1 and event_name = 'entity.updated' order by created_at desc limit 1`,
      [entityIds[0]],
    )).rows[0]!
    expect(audit.before_json.name).toContain('Rename Source')
    expect(audit.after_json.name).toBe('Renamed Canonical Owner')
  })

  it('returns normalized duplicate, not-found, and Admin authorization errors', async () => {
    const duplicateName = (await pool!.query<{ name: string }>('select name from entities where id = $1', [entityIds[1]])).rows[0]!.name
    const duplicate = await f.app.inject({
      method: 'PATCH',
      url: `/v1/entities/${entityIds[0]}`,
      headers: { cookie: f.cookie },
      payload: { name: `  ${duplicateName.toUpperCase()}  ` },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error).toBe('DUPLICATE_ENTITY_NAME')

    const missing = await f.app.inject({
      method: 'PATCH',
      url: `/v1/entities/${randomUUID()}`,
      headers: { cookie: f.cookie },
      payload: { name: 'Missing owner' },
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error).toBe('ENTITY_NOT_FOUND')

    const forbidden = await f.app.inject({
      method: 'PATCH',
      url: `/v1/entities/${entityIds[0]}`,
      headers: { cookie: f.userCookie },
      payload: { name: 'Unauthorized rename' },
    })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().error).toBe('FORBIDDEN_ROLE')
  })
})
