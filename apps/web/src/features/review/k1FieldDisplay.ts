import type { K1TrackerFieldKey, K1TrackerOfficialFormFieldKey } from '../../../../../packages/types/src/k1-tracker'
import type { K1FieldValue } from '../../../../../packages/types/src/review-finalization'
import { K1_EDITABLE_FIELDS } from '../k1-tracker/k1FieldGroups'
import { K1_OFFICIAL_FORM_FIELD_BY_KEY } from '../k1-tracker/k1OfficialFormFields'

export interface K1FieldDisplay {
  title: string
  detail: string | null
  sourceKey: string
}

export type K1ReviewFormGroupId = 'partI' | 'partII' | 'partIII' | 'workpaper'

export interface K1ReviewFormGroup {
  id: K1ReviewFormGroupId
  title: string
  description: string
  fields: K1FieldValue[]
}

const FORM_GROUPS: ReadonlyArray<Omit<K1ReviewFormGroup, 'fields'>> = [
  {
    id: 'partI',
    title: 'Part I - Partnership information',
    description: 'K-1 status, tax period, and partnership identity in printed form order.',
  },
  {
    id: 'partII',
    title: 'Part II - Information about the partner',
    description: 'Partner identity, classification, liabilities, capital account, and related items.',
  },
  {
    id: 'partIII',
    title: "Part III - Partner's share of current-year items",
    description: 'Lines 1 through 23 in printed order. Parentheses are converted to negative values (for example, (409,615) becomes -409,615).',
  },
  {
    id: 'workpaper',
    title: 'Jackson supplemental workpaper',
    description: 'Application-only values that are not literal fields on the Schedule K-1.',
  },
]

const CALCULATION_FIELDS = new Map(K1_EDITABLE_FIELDS.map((definition) => [definition.key, definition]))

const valueRecord = (field: K1FieldValue): Record<string, unknown> | null => {
  const candidates = [
    field.effectiveValueJson,
    field.reviewerCorrectedValueJson,
    field.normalizedValueJson,
    field.rawValueJson,
  ]
  return candidates.find(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate),
  ) ?? null
}

const words = (value: string): string => value
  .replace(/^(official|calculation|match)\./, '')
  .replace(/[._-]+/g, ' ')
  .replace(/\b(k1|ein|tin|irs|llc|ptp|amt)\b/gi, (word) => word.toUpperCase())
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

const detailAfterDash = (label: string): string | null => {
  const detail = label.replace(/^(?:Item\s+[A-Z]\d?|Line\s+\d+[a-z]?)\s+-\s+/i, '')
  return detail === label ? label : detail
}

const officialDisplay = (field: K1FieldValue, sourceKey: string): K1FieldDisplay | null => {
  const key = sourceKey.slice('official.'.length) as K1TrackerOfficialFormFieldKey
  const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(key)
  const record = valueRecord(field)
  const code = typeof record?.code === 'string' ? record.code.trim().toUpperCase() : ''
  const description = typeof record?.description === 'string' ? record.description.trim() : ''

  const codedLine = /^box_(\d+[a-z]?)_entries$/i.exec(key)?.[1]
  if (codedLine) {
    return {
      title: `Part III · Line ${codedLine}${code ? ` · Code ${code}` : ''}`,
      detail: description || (definition ? detailAfterDash(definition.label) : 'Coded K-1 entry'),
      sourceKey,
    }
  }

  const partThreeLine = /^box_(\d+[a-z]?)_/.exec(key)?.[1]
  if (partThreeLine) {
    return {
      title: `Part III · Line ${partThreeLine}`,
      detail: definition ? detailAfterDash(definition.label) : words(key),
      sourceKey,
    }
  }

  const partOneItem = /^part_i_([a-d])_/.exec(key)?.[1]
  if (partOneItem) {
    return {
      title: `Part I · Item ${partOneItem.toUpperCase()}`,
      detail: definition ? detailAfterDash(definition.label) : words(key),
      sourceKey,
    }
  }

  const partTwoItem = /^part_ii_([a-z]\d?)_/.exec(key)?.[1]
  if (partTwoItem) {
    return {
      title: `Part II · Item ${partTwoItem.toUpperCase()}`,
      detail: definition ? detailAfterDash(definition.label) : words(key),
      sourceKey,
    }
  }

  if (key.startsWith('k1_status_')) {
    return { title: 'K-1 status', detail: definition?.label ?? words(key), sourceKey }
  }
  if (key.startsWith('tax_period_')) {
    return { title: 'Tax period', detail: definition?.label ?? words(key), sourceKey }
  }

  return definition
    ? { title: definition.label, detail: null, sourceKey }
    : null
}

const calculationDisplay = (sourceKey: string): K1FieldDisplay => {
  const key = sourceKey.slice('calculation.'.length)
  const definition = CALCULATION_FIELDS.get(key as K1TrackerFieldKey)
  const label = definition?.label ?? words(key)

  if (key.startsWith('box_')) return { title: `Part III · ${label}`, detail: null, sourceKey }
  if (key.startsWith('liability_')) return { title: 'Part II · Item K', detail: label, sourceKey }
  if (key === 'capital_contributions') return { title: 'Part II · Section L', detail: label, sourceKey }
  if (key.startsWith('section_l_')) {
    return { title: 'Part II · Section L', detail: label.replace(/^Section L\s+/i, ''), sourceKey }
  }
  return { title: 'Jackson workpaper', detail: label, sourceKey }
}

const MATCH_LABELS: Record<string, Pick<K1FieldDisplay, 'title' | 'detail'>> = {
  partner_tin: { title: 'Part II - Item E', detail: 'Partner TIN (matching evidence)' },
  partner_name: { title: 'Part II - Item F', detail: 'Partner name (matching evidence)' },
  partnership_ein: { title: 'Part I - Item A', detail: 'Partnership EIN (matching evidence)' },
  partnership_name: { title: 'Part I - Item B', detail: 'Partnership name (matching evidence)' },
  tax_year: { title: 'K-1 tax year', detail: 'Tax year used for destination matching' },
}

export const getK1FieldDisplay = (field: K1FieldValue): K1FieldDisplay => {
  const sourceKey = field.canonicalPath || field.fieldName
  if (sourceKey.startsWith('official.')) {
    const display = officialDisplay(field, sourceKey)
    if (display) return display
  }
  if (sourceKey.startsWith('calculation.')) return calculationDisplay(sourceKey)
  if (sourceKey.startsWith('match.')) {
    const key = sourceKey.slice('match.'.length)
    const display = MATCH_LABELS[key]
    return display ? { ...display, sourceKey } : { title: 'Matching evidence', detail: words(key), sourceKey }
  }

  const readableLabel = field.label && !/[._]/.test(field.label) ? field.label : words(sourceKey)
  return { title: readableLabel, detail: null, sourceKey }
}

export const humanizeK1IssueCode = (value: string): string => words(value).replace(/^K1\s+/, 'K-1 ')

const itemOrder = (item: string): number => {
  const sequence = ['E', 'F', 'G', 'H1', 'H2', 'I1', 'I2', 'J', 'K1', 'K2', 'K3', 'L', 'M', 'N']
  const index = sequence.indexOf(item.toUpperCase())
  return index < 0 ? 999 : index
}

const lineOrder = (line: string): number => {
  const match = /^(\d+)([a-z]?)$/i.exec(line)
  if (!match) return 99999
  const suffix = match[2] ? match[2].toLowerCase().charCodeAt(0) - 96 : 0
  return Number(match[1]) * 100 + suffix
}

const PART_TWO_FIELD_ORDER: Record<string, number> = {
  // Item J is printed as three rows, with beginning and ending columns.
  part_ii_j_profit_beginning_pct: 0,
  part_ii_j_profit_ending_pct: 1,
  part_ii_j_loss_beginning_pct: 10,
  part_ii_j_loss_ending_pct: 11,
  part_ii_j_capital_beginning_pct: 20,
  part_ii_j_capital_ending_pct: 21,
  part_ii_j_decrease_sale: 30,
  part_ii_h2_disregarded_entity: 0,
  part_ii_h2_disregarded_entity_tin: 1,
  part_ii_h2_disregarded_entity_name: 2,
  part_ii_n_704c_gain_loss_beginning: 0,
  part_ii_n_704c_gain_loss_ending: 1,
}

const LIABILITY_ORDER: Record<string, number> = {
  liability_nonrecourse_beginning: 0,
  liability_nonrecourse_ending: 1,
  liability_qualified_nonrecourse_beginning: 10,
  liability_qualified_nonrecourse_ending: 11,
  liability_recourse_beginning: 20,
  liability_recourse_ending: 21,
}

const SECTION_L_ORDER: Record<string, number> = {
  section_l_beginning_capital: 0,
  capital_contributions: 10,
  section_l_current_year_net_income_loss: 20,
  section_l_other_increase_decrease: 30,
  section_l_withdrawals_distributions: 40,
  section_l_ending_capital: 50,
}

const formPosition = (field: K1FieldValue): { group: K1ReviewFormGroupId; order: number } => {
  const sourceKey = field.canonicalPath || field.fieldName

  if (sourceKey.startsWith('match.')) {
    const key = sourceKey.slice('match.'.length)
    if (key === 'tax_year') return { group: 'partI', order: 2 }
    if (key === 'partnership_ein') return { group: 'partI', order: 101 }
    if (key === 'partnership_name') return { group: 'partI', order: 201 }
    if (key === 'partner_tin') return { group: 'partII', order: 1 }
    if (key === 'partner_name') return { group: 'partII', order: 101 }
  }

  if (sourceKey.startsWith('official.')) {
    const key = sourceKey.slice('official.'.length)
    if (key === 'k1_status_final') return { group: 'partI', order: 0 }
    if (key === 'k1_status_amended') return { group: 'partI', order: 1 }
    if (key === 'tax_period_beginning') return { group: 'partI', order: 3 }
    if (key === 'tax_period_ending') return { group: 'partI', order: 4 }
    const partOne = /^part_i_([a-d])_/.exec(key)?.[1]
    if (partOne) return { group: 'partI', order: 100 + (partOne.charCodeAt(0) - 97) * 100 }
    const partTwo = /^part_ii_([a-z]\d?)_/.exec(key)?.[1]
    if (partTwo) {
      return {
        group: 'partII',
        order: itemOrder(partTwo) * 100 + (PART_TWO_FIELD_ORDER[key] ?? 0),
      }
    }
    const line = /^box_(\d+[a-z]?)_/.exec(key)?.[1]
    if (line) return { group: 'partIII', order: lineOrder(line) }
  }

  if (sourceKey.startsWith('calculation.')) {
    const key = sourceKey.slice('calculation.'.length)
    if (key.startsWith('liability_')) {
      return { group: 'partII', order: itemOrder('K1') * 100 + (LIABILITY_ORDER[key] ?? 0) }
    }
    if (key === 'capital_contributions' || key.startsWith('section_l_')) {
      return { group: 'partII', order: itemOrder('L') * 100 + (SECTION_L_ORDER[key] ?? 0) }
    }
    const line = /^box_(\d+[a-z]?)_/.exec(key)?.[1]
    if (line) return { group: 'partIII', order: lineOrder(line) }
  }

  return { group: 'workpaper', order: 99999 }
}

export const groupK1ReviewFields = (fields: K1FieldValue[]): K1ReviewFormGroup[] => {
  // match.* values are routing evidence, not additional printed K-1 fields.
  // They remain visible in the destination-linking console and must not create
  // duplicates such as a second Part I Item A EIN row.
  const visibleFields = fields.filter((field) => field.reviewStatus !== 'REJECTED')
  const hasCodedLine19 = visibleFields.some((field) => {
    if ((field.canonicalPath || field.fieldName) !== 'official.box_19_entries') return false
    const row = valueRecord(field)
    const code = typeof row?.code === 'string' ? row.code.trim() : ''
    const amount = typeof row?.amount === 'string' ? row.amount.trim() : ''
    return Boolean(code || amount)
  })
  const positioned = visibleFields
    .filter((field) => {
      const sourceKey = field.canonicalPath || field.fieldName
      if (sourceKey.startsWith('match.')) return false
      // A coded row (for example 19A) is the printed value. The legacy
      // calculation field is only a fallback for genuinely uncoded forms.
      if (hasCodedLine19 && sourceKey === 'calculation.box_19_distributions') return false
      return true
    })
    .map((field, sourceIndex) => ({ field, sourceIndex, ...formPosition(field) }))
  return FORM_GROUPS.flatMap((group) => {
    const groupedFields = positioned
      .filter((candidate) => candidate.group === group.id)
      .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
      .map((candidate) => candidate.field)
    return groupedFields.length > 0 ? [{ ...group, fields: groupedFields }] : []
  })
}
