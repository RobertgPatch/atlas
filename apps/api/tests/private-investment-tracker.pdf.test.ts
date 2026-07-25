import { describe, expect, it } from 'vitest'
import { buildPrivateInvestmentPdfReportModel, renderPrivateInvestmentPdf } from '../src/modules/partnership-tracker/private-investment-tracker.pdf.js'
import { composePrivateInvestmentTracker, type PrivateInvestmentSourceRow } from '../src/modules/partnership-tracker/private-investment-tracker.js'
import type { PartnershipTrackerSummary } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'

describe('private investment tracker PDF', () => {
  it('preserves selected column order, includes complete matching scope, and renders a PDF', async () => {
    const summary = {
      partnership: { id: '00000000-0000-4000-8000-000000000011', aggregationGroupId: '00000000-0000-4000-8000-000000000011', entity: { id: '00000000-0000-4000-8000-000000000001', name: 'Alder Trust' }, name: 'Growth Fund', partnershipType: 'Private Equity', status: 'ACTIVE', notes: null, inceptionDate: null, managementFeeRate: null, ein: null, fundManager: null, addressLine1: null, addressLine2: null, addressCity: null, addressRegion: null, addressPostalCode: null, addressCountry: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
      currentCommittedCapital: null, latestNav: null, earliestK1Year: null, latestTaxYear: null, latestWorkflowStatus: null, latestEndingOutsideBasis: null, latestSectionLCapital: null,
      totalCapitalContributions: '100.00', totalDistributions: '0.00', totalRecallableDistributions: '0.00', dpi: '0.00000000', tvpi: null, irr: null, irrTerminalDate: null, irrUsesCarriedForwardNav: false, annualizedCashOnCashYield: null, performanceAsOfDate: '2026-07-23', unfundedCommitmentAmount: null, unfundedCommitmentPercentage: null,
      performanceStatus: { dpi: 'AVAILABLE', tvpi: 'MISSING_NAV', irr: 'MISSING_NAV', annualizedCashOnCashYield: 'MISSING_INCEPTION_DATE', unfundedCommitment: 'MISSING_COMMITMENT' },
      simplifiedIrr: null, displayIrr: null, irrType: null, vintageYear: 2024, warningCount: 0,
    } satisfies PartnershipTrackerSummary
    const rows: PrivateInvestmentSourceRow[] = Array.from({ length: 60 }, (_, index) => ({
      sourceId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceKind: 'NET_CASH_ACTIVITY',
      entityId: summary.partnership.entity.id,
      entityName: summary.partnership.entity.name,
      partnershipId: summary.partnership.id,
      partnershipName: summary.partnership.name,
      date: `2025-01-${String(index % 28 + 1).padStart(2, '0')}`,
      type: 'CAPITAL_CALL',
      amount: '100.00',
      sourceType: 'manual',
      note: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    }))
    const report = composePrivateInvestmentTracker([summary], rows, { assetClasses: [], entityIds: [], partnershipIds: [], dateFrom: null, dateTo: null, amountMin: null, amountMax: null, page: 1, pageSize: 25 }, '2026-07-23')
    const model = buildPrivateInvestmentPdfReportModel(report, {
      filters: { assetClasses: [], entityIds: [], partnershipIds: [], dateFrom: null, dateTo: null, amountMin: null, amountMax: null },
      summaryColumns: ['fund', 'entity', 'totalInvested'],
      detailColumns: ['date', 'fund', 'amount'],
    }, '2026-07-23T12:00:00.000Z')
    expect(model.orientation).toBe('landscape')
    expect(model.summaryColumns.map((column) => column.id)).toEqual(['fund', 'entity', 'totalInvested'])
    expect(model.activities).toHaveLength(60)
    const pdf = await renderPrivateInvestmentPdf(model)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2_000)
  })
})
