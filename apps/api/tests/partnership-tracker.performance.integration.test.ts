import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership Tracker bounded list performance', () => {
  let fixture: PartnershipTrackerFixture
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('loads a 100-partnership page with set-based summaries in under two seconds', async () => {
    for (let index = 0; index < 99; index += 1) await fixture.createPartnership({ name: `Performance ${String(index).padStart(3, '0')}` })
    const started = performance.now()
    const result = await partnershipTrackerRepository.listPartnerships({ isAdmin: true, entityIds: [] }, { limit: 100 })
    expect(result.items).toHaveLength(100)
    expect(performance.now() - started).toBeLessThan(2000)
  })
  it('composes active K-1 revisions and latest NAV without double-counting a legacy contribution', async () => {
    const scope = { isAdmin: true, entityIds: [] as string[] }
    const first = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2021, fixture.adminUserId, scope)
    await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2021, first.revision, [
      { fieldKey: 'capital_contributions', amount: '3000000.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'box_19_distributions', amount: '0.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'section_l_ending_capital', amount: '3000000.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    const second = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2022, fixture.adminUserId, scope)
    const secondUpdated = await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2022, second.revision, [
      { fieldKey: 'capital_contributions', amount: '0.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'box_19_distributions', amount: '-190773.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'section_l_ending_capital', amount: '2809227.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2022, secondUpdated.year.revision, [
      { fieldKey: 'liability_nonrecourse_beginning', amount: '0.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'liability_nonrecourse_ending', amount: '999999.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '3000000.00', valuationDate: '2022-12-31' }, fixture.adminUserId, scope)

    const detail = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    expect(detail.summary.totalCapitalContributions).toBe('3000000.00')
    expect(detail.summary.totalDistributions).toBe('190773.00')
    expect(detail.summary.latestSectionLCapital).toBe('2809227.00')
    expect(detail.summary.dpi).toBe('0.06359100')
    expect(detail.summary.tvpi).toBe('1.06359100')
    expect(detail.summary.irr).toBe('0.06363591')
  })
  it('loads 50 years, 50 commitments, and 200 NAV points as bounded detail reads', async () => {
    await pool!.query(`insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status)
      select gen_random_uuid(), $1, $2, 1950 + value, 'NOT_STARTED' from generate_series(0, 49) value`, [fixture.entityId, fixture.partnershipId])
    await pool!.query(`
      insert into k1_tracker_value_revisions (id, tracker_year_id, field_key, amount, source_type, is_active)
      select gen_random_uuid(), year.id, field.key, field.amount, 'MANUAL_ENTRY', true
      from k1_tracker_years year
      cross join (values
        ('capital_contributions', 1000.00::numeric),
        ('box_19_distributions', -100.00::numeric),
        ('section_l_ending_capital', 900.00::numeric)
      ) as field(key, amount)
      where year.partnership_id = $1
    `, [fixture.partnershipId])
    await pool!.query(`insert into partnership_commitments (id, entity_id, partnership_id, commitment_amount, commitment_date, status, source_type)
      select gen_random_uuid(), $1, $2, 1000000 + value * 1000, current_date - value, 'INACTIVE', 'manual' from generate_series(0, 49) value`, [fixture.entityId, fixture.partnershipId])
    await pool!.query(`insert into partnership_fmv_snapshots (id, partnership_id, valuation_date, fmv_amount, source_type)
      select gen_random_uuid(), $1, date '2020-01-01' + value, 800000 + value * 1000, 'manager_statement' from generate_series(0, 199) value`, [fixture.partnershipId])
    const started = performance.now()
    const detail = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    expect(detail.years).toHaveLength(50)
    expect(detail.commitments).toHaveLength(50)
    expect(detail.navEntries).toHaveLength(200)
    expect(detail.summary.totalCapitalContributions).toBe('50000.00')
    expect(detail.summary.totalDistributions).toBe('5000.00')
    expect(detail.summary.latestSectionLCapital).toBe('900.00')
    expect(detail.summary.performanceStatus.irr).toBe('AVAILABLE')
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
