import { afterEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { buildRefreshPolicyFixture } from './helpers/plaidRefreshPolicyTestHelpers.js'
import {
  evaluateSnapshotFreshness,
  getNextRefreshAt,
  getRefreshCutoffAt,
} from '../src/modules/plaid/plaid.refresh-policy.js'
import { plaidRepository } from '../src/modules/plaid/plaid.repository.js'
import { config } from '../src/config.js'

const schedulerToken = 'test-scheduler-token-123'

const createSelectedPlaidAccount = (fixture: TestFixture) => {
  plaidRepository.createConnectionFromPublicToken({
    ownerUserId: fixture.admin.id,
    plaidItemId: 'item-refresh-contract',
    accessToken: 'access-refresh-contract',
    institutionId: 'ins_refresh_contract',
    institutionName: 'Refresh Contract Brokerage',
    metadataAccounts: [
      {
        id: 'contract-account-1',
        name: 'Refresh Contract Account',
        type: 'investment',
        subtype: 'brokerage',
        mask: '1001',
      },
    ],
  })
  plaidRepository.updateSelectedInvestmentAccounts(['contract-account-1'])
}

describe('Plaid refresh policy contract', () => {
  let fixture: TestFixture | null = null
  const originalSchedulerToken = config.plaidRefresh.schedulerToken
  const originalSchedulerEnabled = config.plaidRefresh.schedulerEnabled
  const originalSchedulerMode = config.plaidRefresh.schedulerMode

  afterEach(async () => {
    config.plaidRefresh.schedulerToken = originalSchedulerToken
    config.plaidRefresh.schedulerEnabled = originalSchedulerEnabled
    config.plaidRefresh.schedulerMode = originalSchedulerMode
    if (fixture) {
      await fixture.app.close()
      fixture = null
    }
  })

  it('calculates Pacific cutoff, freshness, and next refresh around 5:00 AM', () => {
    const policy = buildRefreshPolicyFixture()
    const beforeCutoff = new Date('2026-07-01T11:30:00.000Z')
    const afterCutoff = new Date('2026-07-01T13:00:00.000Z')

    expect(getRefreshCutoffAt(policy, beforeCutoff).toISOString()).toBe(
      '2026-06-30T12:00:00.000Z',
    )
    expect(getNextRefreshAt(policy, beforeCutoff).toISOString()).toBe(
      '2026-07-01T12:00:00.000Z',
    )
    expect(getRefreshCutoffAt(policy, afterCutoff).toISOString()).toBe(
      '2026-07-01T12:00:00.000Z',
    )
    expect(getNextRefreshAt(policy, afterCutoff).toISOString()).toBe(
      '2026-07-02T12:00:00.000Z',
    )

    const fresh = evaluateSnapshotFreshness({
      policy,
      now: afterCutoff,
      snapshot: {
        id: 'fresh-snapshot',
        requestedByUserId: null,
        status: 'success',
        startedAt: '2026-07-01T12:05:00.000Z',
        completedAt: '2026-07-01T12:06:00.000Z',
        errorMessage: null,
        selectedAccountIds: ['contract-account-1'],
        dataAsOfDate: '2026-07-01',
        dataAsOfMinDate: '2026-07-01',
        dataAsOfMaxDate: '2026-07-01',
        fetchedAt: '2026-07-01T12:06:00.000Z',
        dashboardEligible: true,
        holdingsCount: 1,
      },
    })
    const stale = evaluateSnapshotFreshness({
      policy,
      now: afterCutoff,
      snapshot: {
        id: 'stale-snapshot',
        requestedByUserId: null,
        status: 'success',
        startedAt: '2026-06-30T12:05:00.000Z',
        completedAt: '2026-06-30T12:06:00.000Z',
        errorMessage: null,
        selectedAccountIds: ['contract-account-1'],
        dataAsOfDate: '2026-06-30',
        dataAsOfMinDate: '2026-06-30',
        dataAsOfMaxDate: '2026-06-30',
        fetchedAt: '2026-06-30T12:06:00.000Z',
        dashboardEligible: true,
        holdingsCount: 1,
      },
    })

    expect(fresh.status).toBe('fresh')
    expect(stale.status).toBe('stale')
    expect(fresh.nextRefreshAt).toBe('2026-07-02T12:00:00.000Z')
  })

  it('requires the scheduler token for the protected scheduler endpoint', async () => {
    config.plaidRefresh.schedulerToken = schedulerToken
    fixture = await createTestFixture()

    const missingToken = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
    })
    const wrongToken = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
      headers: { 'x-atlas-scheduler-token': 'wrong-scheduler-token-123' },
    })

    expect(missingToken.statusCode).toBe(401)
    expect(wrongToken.statusCode).toBe(401)
  })

  it('returns a conflict when a refresh is already pending for selected accounts', async () => {
    config.plaidRefresh.schedulerToken = schedulerToken
    config.plaidRefresh.schedulerEnabled = true
    fixture = await createTestFixture()
    createSelectedPlaidAccount(fixture)
    const pending = await plaidRepository.createRefreshAttempt({
      triggerSource: 'manual',
      refreshReason: 'manual',
      selectedAccountIds: ['contract-account-1'],
    })

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
      headers: { 'x-atlas-scheduler-token': schedulerToken },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: 'REFRESH_ALREADY_RUNNING',
      activeRefreshId: pending.id,
    })
  })

  it('returns admin-only refresh diagnostics without scheduler secrets', async () => {
    config.plaidRefresh.schedulerToken = schedulerToken
    config.plaidRefresh.schedulerEnabled = true
    config.plaidRefresh.schedulerMode = 'eventbridge'
    fixture = await createTestFixture()
    createSelectedPlaidAccount(fixture)
    const attempt = await plaidRepository.createRefreshAttempt({
      triggerSource: 'scheduled',
      refreshReason: 'daily_cutoff',
      selectedAccountIds: ['contract-account-1'],
    })
    await plaidRepository.finalizeRefreshAttempt(attempt.id, {
      status: 'success',
      dataAsOfDate: '2026-07-01',
      completedAt: '2026-07-01T12:10:00.000Z',
    })
    plaidRepository.createSyncSnapshot({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd71',
      requestedByUserId: null,
      selectedAccountIds: ['contract-account-1'],
      status: 'success',
      startedAt: '2026-07-01T12:05:00.000Z',
      completedAt: '2026-07-01T12:10:00.000Z',
      fetchedAt: '2026-07-01T12:10:00.000Z',
      dataAsOfDate: '2026-07-01',
      dataAsOfMinDate: '2026-07-01',
      dataAsOfMaxDate: '2026-07-01',
      dashboardEligible: true,
      holdingsCount: 1,
    })

    const anonymous = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/plaid-refresh-status',
    })
    const nonAdmin = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/plaid-refresh-status',
      headers: { cookie: fixture.userCookie },
    })
    const admin = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/plaid-refresh-status',
      headers: { cookie: fixture.cookie },
    })

    expect(anonymous.statusCode).toBe(401)
    expect(nonAdmin.statusCode).toBe(403)
    expect(admin.statusCode).toBe(200)
    expect(admin.json()).toMatchObject({
      refreshPolicy: {
        cadence: 'daily',
        refreshTimeLocal: '05:00',
        timezone: 'America/Los_Angeles',
        automaticRefreshEnabled: true,
      },
      schedulerConfigured: true,
      schedulerMode: 'eventbridge',
      lastSuccessfulRefreshAt: '2026-07-01T12:10:00.000Z',
      nextRefreshAt: expect.any(String),
      activeRefreshId: null,
      warnings: expect.any(Array),
      checkedAt: expect.any(String),
    })
    expect(JSON.stringify(admin.json())).not.toContain(schedulerToken)
  })
})
