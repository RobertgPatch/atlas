import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T049 — Contract: GET /v1/k1-documents/export.csv
// Asserts content-type + UTF-8 header, row count matches filter, scope enforcement,
// and audit emission (k1.export_generated).
describe('GET /v1/k1-documents/export.csv — export contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns CSV with text/csv; charset=utf-8 and a header row', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/export.csv',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/i)
    expect(res.headers['content-type']).toMatch(/utf-8/i)
    expect(res.headers['content-disposition']).toMatch(/attachment/i)
    expect(res.headers['content-disposition']).toMatch(/\.csv/)

    const text = res.body
    const lines = text.split(/\r\n/)
    expect(lines[0]).toContain('k1_document_id')
    expect(lines[0]).toContain('partnership_name')
    expect(lines[0]).toContain('tax_year')
    expect(lines[0]).toContain('status')
  })

  it('row count reflects the active status filter', async () => {
    const all = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/export.csv',
      headers: { cookie: f.cookie },
    })
    const allRows = all.body.split(/\r\n/).length - 1 // minus header

    const filtered = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/export.csv?status=FINALIZED',
      headers: { cookie: f.cookie },
    })
    const filteredRows = filtered.body.split(/\r\n/).length - 1
    expect(filteredRows).toBeLessThanOrEqual(allRows)
    // Every row on the filtered download has status=FINALIZED in its status column.
    const header = filtered.body.split(/\r\n/)[0]!.split(',')
    const statusIdx = header.indexOf('status')
    for (const line of filtered.body.split(/\r\n/).slice(1)) {
      if (!line) continue
      expect(line.split(',')[statusIdx]).toBe('FINALIZED')
    }
  })

  it('rejects 403 on out-of-scope entity_id', async () => {
    k1Repository._debugSetMemberships(f.admin.id, [f.entityIds[0]!])
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/export.csv?entity_id=${f.entityIds[1]}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(403)
  })

  it('emits a k1.export_generated audit event carrying the row count and filters', async () => {
    const beforeLen = auditRepository
      .getInMemoryEvents()
      .filter((e) => e.eventName === 'k1.export_generated').length
    await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/export.csv?status=NEEDS_REVIEW',
      headers: { cookie: f.cookie },
    })
    const events = auditRepository
      .getInMemoryEvents()
      .filter((e) => e.eventName === 'k1.export_generated')
    expect(events.length).toBe(beforeLen + 1)
    const last = events[events.length - 1]!
    expect(last.actorUserId).toBe(f.admin.id)
    const after = last.after as { rowCount: number; filters: Record<string, unknown> }
    expect(typeof after.rowCount).toBe('number')
    expect(after.filters).toMatchObject({ status: 'NEEDS_REVIEW' })
  })
})
