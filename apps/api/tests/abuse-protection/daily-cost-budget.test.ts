import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAbuseProtectionConfig } from '../../src/config.js'
import { admissionService } from '../../src/modules/abuse-protection/admission.service.js'
import { admitCostWorkload, createServiceCostSubjects } from '../../src/modules/abuse-protection/costWorkloadAdmission.js'
import { createK1IngestionBatch } from '../../src/modules/k1/ingestion/k1Batch.service.js'

afterEach(() => vi.restoreAllMocks())

describe('daily paid-work budget', () => {
  it('reserves upload overhead before creating a batch or signed capability', async () => {
    const admit = vi.spyOn(admissionService, 'admit').mockImplementation(async request => ({
      decision: 'quota_rejected', error: 'QUOTA_EXCEEDED', reasonCode: 'QUOTA_EXCEEDED',
      requestId: request.requestId, policyKey: request.policy.policyKey, retryAfterSeconds: 60,
    }))
    await expect(createK1IngestionBatch({ actorUserId: 'synthetic-user', entityScopeId: null,
      files: [{ fileName: 'synthetic.pdf', sizeBytes: 100, sha256: '0'.repeat(64), mimeType: 'application/pdf' }],
    } as Parameters<typeof createK1IngestionBatch>[0])).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    const quotas = admit.mock.calls[0]![0].workload!.quotas
    const daily = quotas.find(q => q.workloadKey === 'cost-budget:paid-workload-cents' && q.periodKind === 'utc_day')
    const monthly = quotas.find(q => q.workloadKey === 'cost-budget:paid-workload-cents' && q.periodKind === 'billing_month')
    expect(daily).toMatchObject({ units: 2, limit: 2000, scopeKind: 'global' })
    expect(daily!.scopeHash).toEqual(monthly!.scopeHash)
  })
  it.each(['0', '-1', '20.5', '2001', 'NaN'])('rejects unsafe configured cents: %s', value => {
    expect(() => buildAbuseProtectionConfig({ ABUSE_PAID_WORKLOAD_DAILY_BUDGET_CENTS: value }, 'test')).toThrow()
  })

  it('reserves page-based daily cost in the same admission as monthly cost and rejects before work', async () => {
    const admit = vi.spyOn(admissionService, 'admit').mockImplementation(async request => ({
      decision: 'quota_rejected', error: 'QUOTA_EXCEEDED', reasonCode: 'QUOTA_EXCEEDED',
      requestId: request.requestId, policyKey: request.policy.policyKey, retryAfterSeconds: 60,
    }))
    await expect(admitCostWorkload({
      workloadKey: 'k1_bda_provider_call', method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      subjectContext: createServiceCostSubjects('synthetic-worker', 'synthetic-operation', {
        document: 'synthetic-document', provider: 'AWS_BDA',
      }),
      canonicalInputs: { attempt: 'synthetic-only' }, globalDailyLimit: 100, bdaPageCount: 2,
    })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    const quotas = admit.mock.calls[0]![0].workload!.quotas
    const daily = quotas.find(q => q.workloadKey === 'cost-budget:paid-workload-cents' && q.periodKind === 'utc_day')
    const monthly = quotas.find(q => q.workloadKey === 'cost-budget:paid-workload-cents' && q.periodKind === 'billing_month')
    expect(daily).toMatchObject({ units: 39, limit: 2000, scopeKind: 'global' })
    expect(monthly!.scopeHash).toEqual(daily!.scopeHash)
    expect(monthly!.units).toBe(daily!.units)
  })
})
