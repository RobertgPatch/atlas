import { describe, expect, it } from 'vitest'
import type { PartnershipAggregationResponse } from '../../../../../packages/types/src/partnership-tracker'
import {
  buildFundOptions,
  buildInvestmentCsv,
  multipleOf,
  recordsFromAggregation,
  totalsOf,
} from './investmentTrackerModel'

const aggregation = {
  items: [
    {
      groupKey: 'fund-one',
      name: 'Fund One, LP',
      members: [
        {
          partnership: {
            id: 'position-1',
            entity: { id: 'owner-1', name: 'Owner One, LLC' },
            name: 'Fund One, LP',
            partnershipType: 'Real Estate',
            status: 'ACTIVE',
            inceptionDate: '2020-04-03',
            fundManager: 'Manager One',
          },
          currentCommittedCapital: { amount: '150.00', date: '2026-01-01' },
          totalCapitalContributions: '100.00',
          totalDistributions: '20.00',
          latestNav: { amount: '120.00', date: '2026-06-30' },
          unfundedCommitmentAmount: '50.00',
          performanceAsOfDate: '2026-06-30',
        },
      ],
    },
  ],
} as unknown as PartnershipAggregationResponse

describe('investment tracker model', () => {
  it('adapts live aggregation rows without prototype fixtures', () => {
    const records = recordsFromAggregation(aggregation, new Map([['owner-1', 'LLC']]))

    expect(records).toEqual([
      expect.objectContaining({
        id: 'position-1',
        fundId: 'fund-one',
        fundName: 'Fund One, LP',
        ownerName: 'Owner One, LLC',
        ownerType: 'LLC',
        vintage: 2020,
        commitment: 150,
        invested: 100,
        distributions: 20,
        currentValue: 120,
        lastActivityDate: '2026-06-30',
        status: 'Active',
      }),
    ])
  })

  it('rolls positions into funds and computes portfolio totals', () => {
    const records = recordsFromAggregation(aggregation)
    expect(buildFundOptions(records)[0]).toMatchObject({
      id: 'fund-one',
      owners: [{ recordId: 'position-1' }],
    })
    const totals = totalsOf(records)
    expect(totals).toEqual({
      commitment: 150,
      invested: 100,
      unfunded: 50,
      distributions: 20,
      currentValue: 120,
    })
    expect(multipleOf(totals)).toBe(1.4)
  })

  it('exports the visible owner records as escaped CSV', () => {
    const csv = buildInvestmentCsv(recordsFromAggregation(aggregation))
    expect(csv).toContain('Fund,Asset class,Owner entity')
    expect(csv).toContain('"Fund One, LP"')
    expect(csv).toContain('"Owner One, LLC"')
    expect(csv).toContain('1.4')
  })
})
