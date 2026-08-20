import {
  K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS,
  K1_TRACKER_FIELD_KEYS,
  K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS,
  type K1TrackerFieldKey,
  type K1TrackerOfficialFormFieldKey,
  type K1TrackerWritableFieldKey,
} from '../../k1-tracker/k1-tracker.contracts.js'

export const K1_MAPPING_RULE_VERSION = 'k1-form-1065-v1'

export type K1CalculationMappingPolicy =
  | 'DIRECT_K1_FIELD'
  | 'REVIEWED_DERIVATION'
  | 'DATED_ACTIVITY_AUTHORITATIVE'
  | 'WORKPAPER_EXCLUDED'

export interface K1CalculationDestinationDefinition {
  key: K1TrackerFieldKey
  canonicalPath: string | null
  policy: K1CalculationMappingPolicy
  line: string | null
  notes?: string
}

export interface K1OfficialDestinationDefinition {
  key: K1TrackerOfficialFormFieldKey
  canonicalPath: string
  repeated: boolean
}

export const K1_WORKPAPER_EXCLUDED_KEYS = [
  'opening_outside_basis',
  'opening_suspended_loss',
  'book_capital_account',
  'book_interest_income',
  'book_dividend_income',
  'book_realized_capital_gain_loss',
  'book_other_partnership_income_loss',
  'recon_section_704c',
  'recon_section_754',
  'recon_timing_differences',
  'recon_other_permanent_differences',
] as const satisfies readonly K1TrackerWritableFieldKey[]

const reviewedDerivations = new Set<K1TrackerWritableFieldKey>([
  'box_13_other_portfolio_deductions',
  'box_13_management_fees',
  'box_18a_nondeductible_expenses',
  'box_18b_tax_exempt_income',
  'box_18c_nondeductible_expenses',
])

const datedActivity = new Set<K1TrackerWritableFieldKey>([
  'capital_contributions',
  'box_19_distributions',
])

const lineFor = (key: K1TrackerWritableFieldKey): string | null => {
  if (key === 'capital_contributions') return 'L'
  const box = /^box_(\d+[a-z]?)/.exec(key)?.[1]
  if (box) return box.toUpperCase()
  if (key.startsWith('liability_')) return 'K1'
  if (key.startsWith('section_l_')) return 'L'
  return null
}

const deprecated = new Set<string>(K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS)
const excluded = new Set<string>(K1_WORKPAPER_EXCLUDED_KEYS)

export const K1_CALCULATION_DESTINATIONS: readonly K1CalculationDestinationDefinition[] =
  K1_TRACKER_FIELD_KEYS
    .filter((key): key is K1TrackerWritableFieldKey => !deprecated.has(key))
    .map((key) => {
      const policy: K1CalculationMappingPolicy = excluded.has(key)
        ? 'WORKPAPER_EXCLUDED'
        : reviewedDerivations.has(key)
          ? 'REVIEWED_DERIVATION'
          : datedActivity.has(key)
            ? 'DATED_ACTIVITY_AUTHORITATIVE'
            : 'DIRECT_K1_FIELD'
      return {
        key,
        canonicalPath: policy === 'WORKPAPER_EXCLUDED' ? null : `calculation.${key}`,
        policy,
        line: lineFor(key),
        notes: key.startsWith('box_13_')
          ? 'Derived only after a reviewer classifies the official Line 13 code row.'
          : key.startsWith('box_18')
            ? 'Historical Line 18 behavior is versioned and never inferred from an uncoded total.'
            : policy === 'DATED_ACTIVITY_AUTHORITATIVE'
              ? 'The PDF remains evidence when dated cash activity already supplies the canonical value.'
              : undefined,
      }
    })

const repeatedOfficialKeys = new Set<K1TrackerOfficialFormFieldKey>([
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

export const K1_OFFICIAL_DESTINATIONS: readonly K1OfficialDestinationDefinition[] =
  K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS.map((key) => ({
    key,
    canonicalPath: `official.${key}`,
    repeated: repeatedOfficialKeys.has(key),
  }))

export const K1_CALCULATION_DESTINATION_BY_PATH = new Map(
  K1_CALCULATION_DESTINATIONS.flatMap((definition) =>
    definition.canonicalPath ? [[definition.canonicalPath, definition] as const] : []),
)

export const K1_OFFICIAL_DESTINATION_BY_PATH = new Map(
  K1_OFFICIAL_DESTINATIONS.map((definition) => [definition.canonicalPath, definition] as const),
)

export const classifyK1CanonicalPath = (canonicalPath: string): {
  kind: 'CALCULATION' | 'OFFICIAL' | 'MATCH_SIGNAL' | 'EVIDENCE_ONLY'
  key: string | null
} => {
  const calculation = K1_CALCULATION_DESTINATION_BY_PATH.get(canonicalPath)
  if (calculation) return { kind: 'CALCULATION', key: calculation.key }
  const official = K1_OFFICIAL_DESTINATION_BY_PATH.get(canonicalPath)
  if (official) return { kind: 'OFFICIAL', key: official.key }
  if (canonicalPath === 'match.partner_tin' || canonicalPath === 'match.partnership_ein'
    || canonicalPath === 'match.partner_name' || canonicalPath === 'match.partnership_name'
    || canonicalPath === 'match.tax_year') {
    return { kind: 'MATCH_SIGNAL', key: canonicalPath.slice('match.'.length) }
  }
  return { kind: 'EVIDENCE_ONLY', key: null }
}
