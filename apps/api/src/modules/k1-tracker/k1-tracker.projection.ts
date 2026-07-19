import { randomUUID } from 'node:crypto'
import type { K1TrackerCalculation } from './k1-tracker.contracts.js'
import type { Queryable, TrackerValueRow, TrackerYearRow } from './k1-tracker.types.js'

const money = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key]
  return typeof value === 'string' ? value : null
}
const valueMoney = (values: TrackerValueRow[], key: string): string | null => values.find((value) => value.field_key === key)?.amount ?? null

/**
 * The tracker remains the canonical ledger. This projection only maintains the
 * compatible annual fields consumed by existing partnership detail and reports.
 */
export const upsertTrackerAnnualActivity = async (
  client: Queryable,
  year: TrackerYearRow,
  calculation: K1TrackerCalculation,
  values: TrackerValueRow[],
  sources: { hasK1: boolean; hasManualInput: boolean; finalizedDocumentId: string | null },
): Promise<void> => {
  await client.query(`
    insert into partnership_annual_activity (
      id, entity_id, partnership_id, tax_year, interest_amount, dividends_amount,
      capital_gains_amount, total_income_amount, reported_distribution_amount,
      k1_capital_account, beginning_basis_amount, contributions_amount,
      remaining_k1_amount, other_adjustments_amount, ending_tax_basis_amount,
      k1_vs_tax_difference_amount, excess_distribution_amount, negative_basis_flag,
      ending_basis_amount, source_has_k1, source_has_manual_input, finalized_from_k1_document_id, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now(),now()
    ) on conflict (entity_id, partnership_id, tax_year) do update set
      interest_amount = excluded.interest_amount, dividends_amount = excluded.dividends_amount,
      capital_gains_amount = excluded.capital_gains_amount, total_income_amount = excluded.total_income_amount,
      reported_distribution_amount = excluded.reported_distribution_amount, k1_capital_account = excluded.k1_capital_account,
      beginning_basis_amount = excluded.beginning_basis_amount, contributions_amount = excluded.contributions_amount,
      remaining_k1_amount = excluded.remaining_k1_amount, other_adjustments_amount = excluded.other_adjustments_amount,
      ending_tax_basis_amount = excluded.ending_tax_basis_amount, k1_vs_tax_difference_amount = excluded.k1_vs_tax_difference_amount,
      excess_distribution_amount = excluded.excess_distribution_amount, negative_basis_flag = excluded.negative_basis_flag,
      ending_basis_amount = excluded.ending_basis_amount, source_has_k1 = excluded.source_has_k1,
      source_has_manual_input = excluded.source_has_manual_input,
      finalized_from_k1_document_id = excluded.finalized_from_k1_document_id, updated_at = now()
  `, [
    randomUUID(), year.entity_id, year.partnership_id, year.tax_year,
    valueMoney(values, 'box_5_interest_income'), valueMoney(values, 'box_6a_ordinary_dividends'),
    null, null, money(calculation.distribution, 'cashOrPropertyDistribution'), money(calculation.sectionL, 'reportedEnding'),
    money(calculation.basis, 'beginningOutsideBasis'), money(calculation.basis, 'contributions'),
    money(calculation.lossLimitation, 'cumulativeSuspendedLoss'), money(calculation.liabilities, 'netChange'),
    money(calculation.basis, 'endingOutsideBasis'), money(calculation.bookTax, 'bookTaxDifference'),
    money(calculation.distribution, 'taxableExcessDistribution'), money(calculation.basis, 'endingBeforeLimit')?.startsWith('-') ?? false,
    money(calculation.basis, 'endingOutsideBasis'),
    sources.hasK1, sources.hasManualInput, sources.finalizedDocumentId,
  ])
}
