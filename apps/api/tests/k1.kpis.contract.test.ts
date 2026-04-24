import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T016 — Contract: GET /v1/k1-documents/kpis
// Asserts scope-only params (tax_year + entity_id), rejects status/q, returns
// all five lifecycle counts + processingWithErrors (FR-004, Research Decision 5).
describe('GET /v1/k1-documents/kpis — KPI contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns counts for all five lifecycle statuses and processingWithErrors', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    for (const k of [
      'UPLOADED',
      'PROCESSING',
      'NEEDS_REVIEW',
      'READY_FOR_APPROVAL',
      'FINALIZED',
    ]) {
      expect(body.counts).toHaveProperty(k)
      expect(typeof body.counts[k]).toBe('number')
    }
    expect(body).toHaveProperty('processingWithErrors')
    expect(typeof body.processingWithErrors).toBe('number')
    expect(body.scope).toEqual({ taxYear: null, entityId: null })
  })

  it('rejects status query parameter — KPIs are invariant to finding-level filters (FR-004)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis?status=NEEDS_REVIEW',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('VALIDATION_ERROR')
  })

  it('rejects q query parameter', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis?q=blackstone',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('VALIDATION_ERROR')
  })

  it('accepts tax_year and entity_id scope params', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/kpis?tax_year=2024&entity_id=${f.entityIds[0]}`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().scope).toEqual({
      taxYear: 2024,
      entityId: f.entityIds[0],
    })
  })

  it('counts are invariant to table-level filters (FR-004)', async () => {
    const base = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis',
      headers: { cookie: f.cookie },
    })
    // Simulate "user searched / filtered the table" by hitting the list endpoint
    // with filters; KPIs endpoint must be unaffected because it ignores those params.
    await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents?status=FINALIZED&q=blackstone',
      headers: { cookie: f.cookie },
    })
    const after = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents/kpis',
      headers: { cookie: f.cookie },
    })
    expect(after.json()).toEqual(base.json())
  })
})
