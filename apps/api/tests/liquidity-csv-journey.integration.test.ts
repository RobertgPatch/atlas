import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { createTestFixture } from './helpers/testApp.js'
import { csvFixture } from './liquidity-statements/testHelpers.js'
import { buildCsvFixture } from './liquidity-statements/fixtures/buildCsvFixture.js'
import { byteHash } from '../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvProcessingService } from '../src/modules/liquidity-statements/csv-processing.service.js'

describe.skipIf(!pool)('CSV HTTP publication journey', () => {
  it.each(['positions', 'merrill'] as const)('publishes %s through review and exports the same signed gain', async format => {
    const fixture = await createTestFixture(), f = await csvFixture()
    const headers = { cookie: fixture.cookie }
    const call = async (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown) => {
      const response = await fixture.app.inject({ method, url: `/v1${path}`, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
      expect(response.statusCode, response.body).toBeLessThan(300)
      return response.json()
    }
    try {
      const account = await call('POST', '/liquidity-source-accounts', { entityId: f.entityId, custodian: 'Synthetic Broker', name: 'Journey', currency: 'USD' })
      const body = Buffer.from(buildCsvFixture({ format, ...(format === 'positions' ? { total: '800' } : {}) }))
      const sha256 = byteHash(body)
      const cap = await call('POST', '/liquidity-statements/upload-capability', { entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.csv', sizeBytes: body.length, sha256, contentType: 'text/csv' })
      const put = await fixture.app.inject({ method: 'PUT', url: cap.url, headers: { ...headers, ...cap.requiredHeaders }, payload: body })
      expect(put.statusCode, put.body).toBe(201)
      await call('POST', `/liquidity-statements/${cap.statementId}/complete`, { expectedVersion: cap.version, storageVersionId: put.json().storageVersionId, sha256 })
      await csvProcessingService.processOne(cap.statementId)
      let draft = await call('GET', `/liquidity-statements/${cap.statementId}`)
      const bindings = [{ occurrenceId: draft.canonicalDraft.accounts[0].occurrenceId, accountId: account.id, expectedAccountVersion: 1, completeAccount: true, emptyAccountConfirmed: false, acknowledgedIssueIds: draft.issues.filter((i: { severity: string }) => i.severity === 'WARNING').map((i: { id: string }) => i.id) }]
      draft = await call('PATCH', `/liquidity-statements/${cap.statementId}/review`, { expectedVersion: draft.summary.version, changes: [{ fieldPath: 'accounts.0.currency', value: 'USD', reason: 'Confirmed account currency' }], accountBindings: bindings })
      expect(draft.summary.status).toBe('READY_TO_APPLY')
      const preview = await call('POST', `/liquidity-statements/${cap.statementId}/application-preview`, { expectedVersion: draft.summary.version, accountBindings: bindings })
      const apply = { previewId: preview.id, expectedVersion: preview.expectedVersion, summaryHash: preview.summaryHash, idempotencyKey: randomUUID() }
      const result = await call('POST', `/liquidity-statements/${cap.statementId}/apply`, apply)
      expect(await call('POST', `/liquidity-statements/${cap.statementId}/apply`, apply)).toEqual(result)
      const report = await call('GET', `/reports/consolidated-holdings?accountId=${account.id}&pricingMode=saved`)
      expect(report.kpis).toMatchObject({ totalMarketValue: 800, totalCostBasis: 1000, totalUnrealizedGainLoss: -200 })
      expect(report.pricingCapability.realTimeEquitiesEnabled).toBe(false)
      const exported = await fixture.app.inject({ method: 'GET', url: `/v1/reports/consolidated-holdings/export?format=csv&accountId=${account.id}`, headers })
      expect(exported.statusCode, exported.body).toBe(200)
      expect(exported.body).toContain('-200')
      expect(exported.body).toContain('CSV_ONLY')
    } finally { await fixture.app.close() }
  })
})
