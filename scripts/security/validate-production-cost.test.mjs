import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateProductionCost } from './validate-production-cost.mjs'

const rates = {
  schemaVersion: '1.0.0',
  region: 'us-west-2',
  retrievedAt: '2026-08-28T00:00:00Z',
  sources: ['https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json'],
  rates: {
    nat_gateway_hours: 0.045,
    public_ipv4_hours: 0.005,
    alb_hours: 0.0225,
    rds_t4g_micro_hours: 0.016,
    rds_gp3_gib_months: 0.115,
    fargate_vcpu_hours: 0.04048,
    fargate_gib_hours: 0.004445,
    waf_fixed_months: 13,
    secrets_months: 0.4,
    kms_key_months: 1,
    alarm_months: 0.1,
  },
}

const profile = {
  schemaVersion: '1.0.0',
  region: 'us-west-2',
  hoursPerMonth: 730,
  apiDesiredCount: 1,
  apiCpu: 256,
  apiMemoryMiB: 512,
  k1AwsIngestionEnabled: false,
  paidInferenceCalls: 0,
  usageUpperBoundMonthlyUsd: 5.98,
  targetMonthlyUsd: 110,
  budgetThresholdUsd: 125,
  budgetActionCount: 0,
  recurringResources: [
    { key: 'nat', rateKey: 'nat_gateway_hours', quantity: 730 },
    { key: 'nat-ipv4', rateKey: 'public_ipv4_hours', quantity: 730 },
    { key: 'alb', rateKey: 'alb_hours', quantity: 730 },
    { key: 'rds-compute', rateKey: 'rds_t4g_micro_hours', quantity: 730 },
    { key: 'rds-storage', rateKey: 'rds_gp3_gib_months', quantity: 20 },
    { key: 'api-cpu', rateKey: 'fargate_vcpu_hours', quantity: 182.5 },
    { key: 'api-memory', rateKey: 'fargate_gib_hours', quantity: 365 },
    { key: 'waf', rateKey: 'waf_fixed_months', quantity: 1 },
    { key: 'secrets', rateKey: 'secrets_months', quantity: 13 },
    { key: 'kms', rateKey: 'kms_key_months', quantity: 2 },
    { key: 'alarms', rateKey: 'alarm_months', quantity: 19 },
  ],
}

const clone = (value) => structuredClone(value)
const now = new Date('2026-08-29T00:00:00Z')

test('calculates the approved production estimate without premature line rounding', () => {
  const result = calculateProductionCost(profile, rates, { now })
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(result.evidence.fixedMonthlyUsd, 98.02)
  assert.equal(result.evidence.usageUpperBoundMonthlyUsd, 5.98)
  assert.equal(result.evidence.estimatedMonthlyUsd, 104)
  assert.deepEqual(result.evidence.unpricedRecurringResources, [])
  assert.equal(result.evidence.workloadProfileMatched, true)
})

test('rejects stale, wrong-region, or undocumented price metadata', () => {
  const stale = clone(rates); stale.retrievedAt = '2026-01-01T00:00:00Z'
  assert.equal(calculateProductionCost(profile, stale, { now, maxRateAgeDays: 30 }).valid, false)
  const wrongRegion = clone(rates); wrongRegion.region = 'us-east-1'
  assert.equal(calculateProductionCost(profile, wrongRegion, { now }).valid, false)
  const noSource = clone(rates); noSource.sources = []
  assert.equal(calculateProductionCost(profile, noSource, { now }).valid, false)
})

test('fails closed for unpriced recurring resources and invalid arithmetic inputs', () => {
  const unpriced = clone(profile)
  unpriced.recurringResources.push({ key: 'unexpected-cache', rateKey: 'elasticache_hours', quantity: 730 })
  const unpricedResult = calculateProductionCost(unpriced, rates, { now })
  assert.equal(unpricedResult.valid, false)
  assert.deepEqual(unpricedResult.evidence.unpricedRecurringResources, ['unexpected-cache'])

  const invalidQuantity = clone(profile)
  invalidQuantity.recurringResources[0].quantity = Number.POSITIVE_INFINITY
  assert.equal(calculateProductionCost(invalidQuantity, rates, { now }).valid, false)
})

test('rejects workload drift, paid features, estimates over target, budget drift, and actions', () => {
  for (const mutate of [
    (value) => { value.apiDesiredCount = 2 },
    (value) => { value.apiCpu = 512 },
    (value) => { value.apiMemoryMiB = 1024 },
    (value) => { value.k1AwsIngestionEnabled = true },
    (value) => { value.paidInferenceCalls = 1 },
    (value) => { value.usageUpperBoundMonthlyUsd = 20 },
    (value) => { value.budgetThresholdUsd = 100 },
    (value) => { value.budgetActionCount = 1 },
  ]) {
    const changed = clone(profile)
    mutate(changed)
    assert.equal(calculateProductionCost(changed, rates, { now }).valid, false)
  }
})
