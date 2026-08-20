import { z } from 'zod'
import { K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS, type K1TrackerOfficialFormFieldKey } from './k1-tracker.contracts.js'

const booleanKeys = new Set<K1TrackerOfficialFormFieldKey>([
  'k1_status_final',
  'k1_status_amended',
  'part_i_d_publicly_traded_partnership',
  'part_ii_h2_disregarded_entity',
  'part_ii_i2_retirement_plan',
  'part_ii_j_decrease_sale',
  'part_ii_j_decrease_exchange',
  'part_ii_k2_lower_tier_liabilities',
  'part_ii_k3_guaranteed_liabilities',
  'box_16_schedule_k3_attached',
  'box_22_more_than_one_at_risk_activity',
  'box_23_more_than_one_passive_activity',
])

const codedKeys = new Set<K1TrackerOfficialFormFieldKey>([
  'box_11_entries',
  'box_13_entries',
  'box_14_entries',
  'box_15_entries',
  'box_17_entries',
  'box_18_entries',
  'box_19_entries',
  'box_20_entries',
  'box_21_entries',
])

const moneyKeys = new Set<K1TrackerOfficialFormFieldKey>([
  'part_ii_n_704c_gain_loss_beginning',
  'part_ii_n_704c_gain_loss_ending',
  'box_4a_guaranteed_payments_services',
  'box_4b_guaranteed_payments_capital',
  'box_6b_qualified_dividends',
  'box_6c_dividend_equivalents',
  'box_9b_collectibles_gain_loss',
  'box_9c_unrecaptured_section_1250_gain',
])

const percentageKeys = new Set<K1TrackerOfficialFormFieldKey>([
  'part_ii_j_profit_beginning_pct',
  'part_ii_j_profit_ending_pct',
  'part_ii_j_loss_beginning_pct',
  'part_ii_j_loss_ending_pct',
  'part_ii_j_capital_beginning_pct',
  'part_ii_j_capital_ending_pct',
])

const dateKeys = new Set<K1TrackerOfficialFormFieldKey>(['tax_period_beginning', 'tax_period_ending'])
const isCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const choiceValues: Partial<Record<K1TrackerOfficialFormFieldKey, Set<string>>> = {
  part_ii_g_partner_classification: new Set(['GENERAL_PARTNER_OR_LLC_MEMBER_MANAGER', 'LIMITED_PARTNER_OR_OTHER_LLC_MEMBER']),
  part_ii_h1_partner_residency: new Set(['DOMESTIC', 'FOREIGN']),
  part_ii_m_built_in_gain_loss: new Set(['YES', 'NO']),
}

const codeEntrySchema = z.object({
  code: z.string().trim().max(24),
  value: z.string().trim().max(4_000),
}).strict().refine((entry) => Boolean(entry.code || entry.value), 'A code row cannot be empty.')

const valueSchema = z.union([
  z.string().max(4_000),
  z.boolean(),
  z.array(codeEntrySchema).max(50),
  z.null(),
])

export const k1OfficialFormDataSchema = z.record(z.enum(K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS), valueSchema)
  .superRefine((data, context) => {
    if (JSON.stringify(data).length > 100_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Official K-1 form data is too large.' })
    }
    if (data.k1_status_final === true && data.k1_status_amended === true) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['k1_status_amended'], message: 'A K-1 cannot be both final and amended.' })
    }
    if (typeof data.tax_period_beginning === 'string' && typeof data.tax_period_ending === 'string'
      && data.tax_period_beginning > data.tax_period_ending) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['tax_period_ending'], message: 'Tax period ending must be on or after the beginning date.' })
    }

    for (const [rawKey, value] of Object.entries(data)) {
      const key = rawKey as K1TrackerOfficialFormFieldKey
      if (value === null) continue
      const expected = booleanKeys.has(key) ? 'boolean' : codedKeys.has(key) ? 'coded rows' : 'text'
      const correctType = booleanKeys.has(key) ? typeof value === 'boolean' : codedKeys.has(key) ? Array.isArray(value) : typeof value === 'string'
      if (!correctType) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `Expected ${expected} for this official K-1 field.` })
        continue
      }
      if (typeof value !== 'string') continue
      if (dateKeys.has(key) && value && !isCalendarDate(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use a valid date in YYYY-MM-DD format.' })
      }
      if (moneyKeys.has(key) && value && !/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use a money value with at most two decimals.' })
      }
      if (percentageKeys.has(key) && value && (!/^\d+(?:\.\d{1,6})?$/.test(value) || Number(value) > 100)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use a percentage from 0 through 100 with up to six decimals.' })
      }
      const allowedChoices = choiceValues[key]
      if (allowedChoices && value && !allowedChoices.has(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use one of the supported official-form choices.' })
      }
    }
  })

export const k1OfficialFieldSourceMetadataSchema = z.object({
  sourceType: z.enum(['FINALIZED_K1', 'MANUAL_ENTRY', 'MANUAL_OVERRIDE']),
  sourceK1DocumentId: z.string().uuid().nullable(),
  sourceK1FieldValueIds: z.array(z.string().uuid()),
  extractionAttemptId: z.string().uuid().nullable(),
  createdByEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
}).strict()
