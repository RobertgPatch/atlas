import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const validatorUrl = new URL('./validate-cost-envelope.mjs', import.meta.url)
const REQUIRED_WORKLOADS = ['k1_bda_document', 'plaid_refresh']
const AS_OF = new Date('2026-08-25T12:00:00.000Z')

const workload = (overrides = {}) => ({
  workloadKey: 'k1_bda_document',
  unitName: 'document',
  unitPriceUsd: 0.1,
  maximumProviderAttempts: 2,
  perPrincipalRollingLimit: 2,
  perPrincipalDailyLimit: 5,
  globalDailyLimit: 10,
  globalConcurrencyLimit: 2,
  globalBacklogLimit: 5,
  warningPercent: 70,
  emergencyPercent: 90,
  owner: 'tax-documents',
  reviewedAt: '2026-08-01',
  reviewBefore: '2026-09-01',
  ...overrides,
})

const validDocument = () => ({
  version: 1,
  environment: 'production',
  approvedDailyUsd: 5,
  workloads: [
    workload(),
    workload({
      workloadKey: 'plaid_refresh',
      unitName: 'provider_call',
      unitPriceUsd: 0.05,
      maximumProviderAttempts: 1,
      globalDailyLimit: 20,
      owner: 'financial-integrations',
    }),
  ],
  vulnerabilityExceptions: [],
})

const validate = async (document) => {
  const module = await import(validatorUrl.href)
  assert.equal(
    typeof module.validateCostEnvelope,
    'function',
    'validate-cost-envelope.mjs must export validateCostEnvelope for deterministic CI tests',
  )
  return module.validateCostEnvelope(document, {
    environment: 'production',
    requiredWorkloads: REQUIRED_WORKLOADS,
    now: AS_OF,
  })
}

const errorCodes = (result) => (result.errors ?? []).map((error) =>
  typeof error === 'string' ? error : error.code)

describe('cost-envelope validation', () => {
  it('rejects a missing paid workload', async () => {
    const document = validDocument()
    document.workloads = document.workloads.filter(
      ({ workloadKey }) => workloadKey !== 'plaid_refresh',
    )

    const result = await validate(document)

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('MISSING_WORKLOAD'))
  })

  it('rejects unlimited or non-finite global ceilings', async () => {
    const document = validDocument()
    document.workloads[0].globalDailyLimit = null
    document.workloads[1].globalConcurrencyLimit = Number.POSITIVE_INFINITY

    const result = await validate(document)

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('UNLIMITED_GLOBAL_DAILY_LIMIT'))
    assert.ok(errorCodes(result).includes('UNLIMITED_GLOBAL_CONCURRENCY_LIMIT'))
  })

  it('rejects stale provider-price reviews', async () => {
    const document = validDocument()
    document.workloads[0].reviewBefore = '2026-08-24'

    const result = await validate(document)

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('STALE_PRICE_REVIEW'))
  })

  it('rejects expired vulnerability exceptions', async () => {
    const document = validDocument()
    document.vulnerabilityExceptions = [{
      findingId: 'GHSA-test-expired',
      packagePath: 'api>example-package',
      severity: 'moderate',
      runtimeExposure: 'production',
      exploitability: 'Reviewed temporary exception.',
      compensatingControls: ['Provider admission remains fail closed.'],
      owner: 'platform-security',
      targetDate: '2026-08-20',
      expiresOn: '2026-08-24',
      approvedBy: 'security-reviewer',
    }]

    const result = await validate(document)

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('EXPIRED_EXCEPTION'))
  })

  it('calculates the finite approved maximum daily USD total', async () => {
    const result = await validate(validDocument())

    assert.deepEqual(result.errors, [])
    assert.equal(result.valid, true)
    assert.equal(result.maximumDailyCostUsd, 3)
    assert.deepEqual(
      result.workloads.map(({ workloadKey, maximumDailyCostUsd }) => ({
        workloadKey,
        maximumDailyCostUsd,
      })),
      [
        { workloadKey: 'k1_bda_document', maximumDailyCostUsd: 2 },
        { workloadKey: 'plaid_refresh', maximumDailyCostUsd: 1 },
      ],
    )
    assert.ok(result.maximumDailyCostUsd <= 5)
  })
})
