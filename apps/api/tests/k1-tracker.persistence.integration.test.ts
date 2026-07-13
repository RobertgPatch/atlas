import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { K1TrackerError } from '../src/modules/k1-tracker/k1-tracker.types.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { createK1TrackerFixture, type K1TrackerFixture } from './helpers/k1TrackerFixture.js'

const durable = pool ? it : it.skip
describe('K1 Tracker durable ledger', () => {
  let fixture: K1TrackerFixture
  const scope = () => ({ isAdmin: true, entityIds: [] })
  beforeEach(async () => { fixture = await createK1TrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })

  durable('persists append-only revisions and rejects a stale expected revision', async () => {
    await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_beginning_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_current_year_net_income_loss', amount: '0.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_ending_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'book_capital_account', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())
    const before = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope())
    await k1TrackerRepository.updateYear(fixture.partnershipId, 2024, before.revision, [{ fieldKey: 'opening_outside_basis', amount: '112.34', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())
    const after = await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope())
    expect(after.revision).toBe(before.revision + 1)
    expect(after.values.find((value) => value.fieldKey === 'opening_outside_basis')?.amount).toBe('112.34')
    await expect(k1TrackerRepository.updateYear(fixture.partnershipId, 2024, before.revision, [{ fieldKey: 'opening_outside_basis', amount: '9.99', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())).rejects.toMatchObject<K1TrackerError>({ code: 'STALE_TRACKER_REVISION' })
    const rows = await pool!.query<{ count: string }>('select count(*)::text as count from k1_tracker_value_revisions where tracker_year_id = (select id from k1_tracker_years where partnership_id = $1 and tax_year = 2024)', [fixture.partnershipId])
    expect(Number(rows.rows[0]!.count)).toBeGreaterThan(after.values.length)
    const projection = await pool!.query<{ ending_tax_basis_amount: string; source_has_k1: boolean; source_has_manual_input: boolean }>('select ending_tax_basis_amount, source_has_k1, source_has_manual_input from partnership_annual_activity where partnership_id = $1 and tax_year = 2024', [fixture.partnershipId])
    expect(projection.rows[0]).toMatchObject({ ending_tax_basis_amount: '112.34', source_has_k1: false, source_has_manual_input: true })
  })

  durable('stores revision-specific preparation and invalidates it after a material edit', async () => {
    const created = await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_beginning_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_current_year_net_income_loss', amount: '0.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_ending_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'book_capital_account', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())
    const prepared = await k1TrackerRepository.signoff(fixture.partnershipId, 2024, created.revision, 'PREPARED', null, fixture.adminUserId, scope())
    expect(prepared.preparedAt).not.toBeNull()
    const updated = await k1TrackerRepository.updateYear(fixture.partnershipId, 2024, created.revision, [{ fieldKey: 'box_5_interest_income', amount: '0.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())
    expect(updated.year.signoff.invalidatedAt).not.toBeNull()
  })

  durable('requires a distinct reviewer and transitions a passing year to reconciled', async () => {
    const created = await k1TrackerRepository.createYear(fixture.partnershipId, 2024, [{ fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_beginning_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_current_year_net_income_loss', amount: '0.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'section_l_ending_capital', amount: '100.00', sourceType: 'MANUAL_ENTRY' }, { fieldKey: 'book_capital_account', amount: '100.00', sourceType: 'MANUAL_ENTRY' }], fixture.adminUserId, scope())
    await k1TrackerRepository.signoff(fixture.partnershipId, 2024, created.revision, 'PREPARED', null, fixture.adminUserId, scope())
    await expect(k1TrackerRepository.signoff(fixture.partnershipId, 2024, created.revision, 'REVIEWED', null, fixture.adminUserId, scope())).rejects.toMatchObject<K1TrackerError>({ code: 'SIGNOFF_GATE_FAILED' })
    const reviewer = authRepository.listUsers().find((user) => user.role === 'User')!
    const signed = await k1TrackerRepository.signoff(fixture.partnershipId, 2024, created.revision, 'REVIEWED', null, reviewer.id, scope())
    expect(signed.reviewedByEmail).toBe(reviewer.email)
    expect((await k1TrackerRepository.getYear(fixture.partnershipId, 2024, scope())).status).toBe('RECONCILED')
  })
})
