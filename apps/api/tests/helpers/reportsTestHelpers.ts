import type { TestFixture } from './testApp.js'

export const findSinglePartnershipEntity = (fixture: TestFixture): {
  entityId: string
  partnershipId: string
} => {
  const byEntity = new Map<string, string[]>()
  for (const partnership of fixture.partnerships) {
    const rows = byEntity.get(partnership.entityId)
    if (rows) {
      rows.push(partnership.id)
    } else {
      byEntity.set(partnership.entityId, [partnership.id])
    }
  }

  const singleEntry = [...byEntity.entries()].find(([, partnershipIds]) => partnershipIds.length === 1)
  if (!singleEntry) {
    throw new Error('Expected at least one entity with a single partnership in fixture')
  }

  return {
    entityId: singleEntry[0],
    partnershipId: singleEntry[1][0]!,
  }
}

export const createCommitmentViaApi = async (
  fixture: TestFixture,
  partnershipId: string,
  amount: number,
) => {
  const response = await fixture.app.inject({
    method: 'POST',
    url: `/v1/partnerships/${partnershipId}/commitments`,
    headers: { cookie: fixture.cookie },
    payload: {
      commitmentAmountUsd: amount,
      commitmentDate: '2024-01-01',
      sourceType: 'manual',
    },
  })

  return response
}

export const getPortfolioSummaryViaApi = async (
  fixture: TestFixture,
  query = '',
  cookie = fixture.cookie,
) =>
  fixture.app.inject({
    method: 'GET',
    url: `/v1/reports/portfolio-summary${query ? `?${query}` : ''}`,
    headers: { cookie },
  })

export const getAssetClassSummaryViaApi = async (
  fixture: TestFixture,
  query = '',
  cookie = fixture.cookie,
) =>
  fixture.app.inject({
    method: 'GET',
    url: `/v1/reports/asset-class-summary${query ? `?${query}` : ''}`,
    headers: { cookie },
  })
