import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'

describe('Review mapping with manual partnership creation', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('allows manually created partnerships to be discovered and mapped to a K-1', async () => {
    const targetEntityId = f.partnerships[0]!.entityId
    const manualName = `Manual Pre-K1 Partnership ${Date.now()}`

    const createRes = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
      payload: {
        entityId: targetEntityId,
        name: manualName,
        assetClass: 'Private Equity',
        status: 'ACTIVE',
      },
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json() as { id: string; name: string }

    const typeaheadRes = await f.app.inject({
      method: 'GET',
      url: `/v1/review/partnerships?entity_id=${targetEntityId}&q=${encodeURIComponent('Manual Pre-K1')}&limit=20`,
      headers: { cookie: f.cookie },
    })

    expect(typeaheadRes.statusCode).toBe(200)
    const typeaheadBody = typeaheadRes.json() as {
      items: Array<{ id: string; name: string; entityId: string }>
    }
    expect(typeaheadBody.items.some((row) => row.id === created.id)).toBe(true)

    const sessionRes = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${f.k1NeedsReview}/review-session`,
      headers: { cookie: f.cookie },
    })
    expect(sessionRes.statusCode).toBe(200)
    const version = (sessionRes.json() as { version: number }).version

    const mapRes = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/map-partnership`,
      headers: {
        cookie: f.cookie,
        'if-match': String(version),
      },
      payload: {
        partnershipId: created.id,
      },
    })

    expect(mapRes.statusCode).toBe(200)

    const updatedSessionRes = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${f.k1NeedsReview}/review-session`,
      headers: { cookie: f.cookie },
    })
    expect(updatedSessionRes.statusCode).toBe(200)
    const updatedSession = updatedSessionRes.json() as {
      partnership: { id: string | null; name: string | null }
    }

    expect(updatedSession.partnership.id).toBe(created.id)
    expect(updatedSession.partnership.name).toBe(created.name)
  })
})
