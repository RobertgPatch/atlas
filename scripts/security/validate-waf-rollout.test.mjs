import assert from 'node:assert/strict'
import test from 'node:test'

import { validateWafRolloutEvidence } from './validate-waf-rollout.mjs'

const now = new Date('2026-08-29T18:00:00Z')
const validEvidence = {
  schemaVersion: '1.0.0',
  owner: 'security-operator',
  generatedAt: '2026-08-29T17:00:00Z',
  expiresAt: '2026-08-30T16:59:59Z',
  targetRule: 'auth_per_ip',
  transition: 'count_to_block',
  fromAction: 'count',
  toAction: 'block',
  retainedFlows: [
    'homepage',
    'dashboard',
    'liquidity',
    'investment_tracker',
    'tic_registry',
    'entities',
  ].map((name) => ({ name, status: 'pass' })),
  observability: {
    wafMetricProven: true,
    alarmDestinationConfirmed: true,
    redactionReviewed: true,
  },
  rollback: {
    preservesWebAclAttachment: true,
    preservesPrivateOrigin: true,
    preservesHardAuthGlobalCeiling: true,
    preservesHardPaidGlobalCeiling: true,
  },
  changedInputs: ['waf.auth_per_ip.action'],
}

const clone = (value) => structuredClone(value)

test('accepts bounded no-Apply Count-to-Block evidence', () => {
  assert.deepEqual(validateWafRolloutEvidence(validEvidence, { now }), {
    valid: true,
    errors: [],
  })
})

test('accepts rollback only when it changes Block back to Count', () => {
  const rollback = clone(validEvidence)
  rollback.transition = 'rollback_to_count'
  rollback.fromAction = 'block'
  rollback.toAction = 'count'
  assert.equal(validateWafRolloutEvidence(rollback, { now }).valid, true)

  rollback.toAction = 'allow'
  assert.equal(validateWafRolloutEvidence(rollback, { now }).valid, false)
})

test('rejects missing owner, expiry, retained flow, or monitoring evidence', () => {
  for (const mutate of [
    (value) => { value.owner = '' },
    (value) => { value.expiresAt = '2026-08-31T17:00:01Z' },
    (value) => { value.retainedFlows.pop() },
    (value) => { value.observability.redactionReviewed = false },
  ]) {
    const changed = clone(validEvidence)
    mutate(changed)
    assert.equal(validateWafRolloutEvidence(changed, { now }).valid, false)
  }
})

test('rejects ACL detach, origin exposure, hard-ceiling removal, and extra mutations', () => {
  for (const field of [
    'preservesWebAclAttachment',
    'preservesPrivateOrigin',
    'preservesHardAuthGlobalCeiling',
    'preservesHardPaidGlobalCeiling',
  ]) {
    const changed = clone(validEvidence)
    changed.rollback[field] = false
    assert.equal(validateWafRolloutEvidence(changed, { now }).valid, false)
  }
  const expanded = clone(validEvidence)
  expanded.changedInputs.push('edge.web_acl_id')
  assert.equal(validateWafRolloutEvidence(expanded, { now }).valid, false)
})
