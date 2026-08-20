import type {
  K1TrackerCheckResult,
  K1TrackerWritableFieldKey,
} from '../../../../../packages/types/src/k1-tracker'

export interface K1ReconciliationGuidance {
  title: string
  description: string
  actionLabel?: string
  fieldKey?: K1TrackerWritableFieldKey
}

const money = (value: string | null): string | null => value == null
  ? null
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value))

export const isReconciliationBlocker = (check: K1TrackerCheckResult): boolean =>
  check.status === 'FAIL' || check.status === 'INCOMPLETE'

export const reconciliationGuidanceFor = (check: K1TrackerCheckResult): K1ReconciliationGuidance => {
  const actual = money(check.actual)
  const expected = money(check.expected)

  switch (check.key) {
    case 'required-source-data':
      return {
        title: 'Opening outside basis is missing',
        description: 'Schedule K-1 does not report tax-basis outside basis. Enter it from the prior-year basis workpaper, purchase records, or your tax preparer. This value cannot be inferred safely from capital account data.',
        actionLabel: 'Enter opening basis',
        fieldKey: 'opening_outside_basis',
      }
    case 'basis-continuity':
      return {
        title: 'Opening basis differs from the prior year',
        description: `Compare the opening basis with the prior-year ending basis${expected ? ` of ${expected}` : ''}. If the difference is supported, keep the sourced value and acknowledge the warning.`,
        actionLabel: 'Review opening basis',
        fieldKey: 'opening_outside_basis',
      }
    case 'negative-before-limit-basis':
      return {
        title: 'Basis falls below zero before tax limits',
        description: `The pre-limit calculation is ${actual ?? 'below zero'}. Review opening basis and distributions. If those source values are correct, Jackson will floor basis at zero and carry the limitation forward.`,
        actionLabel: 'Review opening basis',
        fieldKey: 'opening_outside_basis',
      }
    case 'suspended-losses':
      return {
        title: 'Losses or deductions remain suspended',
        description: `${actual ?? 'A calculated amount'} will carry forward because current basis is insufficient. This is a calculated outcome, not necessarily missing data.`,
        actionLabel: 'Review opening suspended loss',
        fieldKey: 'opening_suspended_loss',
      }
    case 'taxable-excess-distribution':
      return {
        title: 'Potential taxable excess distribution',
        description: `${actual ?? 'A calculated distribution amount'} exceeds available basis. Review opening basis and the K-1 distribution amount; if both agree to source records, acknowledge the warning for reconciliation.`,
        actionLabel: 'Review opening basis',
        fieldKey: 'opening_outside_basis',
      }
    case 'section-l-net-income':
      return {
        title: check.status === 'INCOMPLETE' ? 'Section L net income is missing' : 'Section L net income does not tie',
        description: `Enter Part II, Item L current-year net income (loss) as shown on the K-1. Jackson expects ${expected ?? 'the calculated K-1 activity total'}.`,
        actionLabel: 'Review Section L net income',
        fieldKey: 'section_l_current_year_net_income_loss',
      }
    case 'section-l-ending':
      return {
        title: check.status === 'INCOMPLETE' ? 'Section L ending capital is missing' : 'Section L ending capital does not tie',
        description: `Enter Part II, Item L ending capital account from the K-1. Jackson's rollforward currently expects ${expected ?? 'the calculated ending amount'}.`,
        actionLabel: 'Enter ending capital',
        fieldKey: 'section_l_ending_capital',
      }
    case 'book-tax-unexplained':
      return {
        title: check.status === 'INCOMPLETE' ? 'Ending book capital is missing' : 'Book-to-tax difference is not fully explained',
        description: check.status === 'INCOMPLETE'
          ? 'Enter ending book capital from the supporting capital statement. If book capital differs from outside tax basis, add the supported Section 704(c), Section 754, timing, or permanent differences below.'
          : `The remaining unexplained difference is ${money(check.difference) ?? 'greater than the $1 tolerance'}. Update the supported reconciling items until the difference is zero.`,
        actionLabel: 'Complete book-tax workpaper',
        fieldKey: 'book_capital_account',
      }
    case 'journal-balance':
      return {
        title: 'Generated journal does not balance',
        description: `The journal difference is ${money(check.difference) ?? 'not zero'}. Review the entered income, deduction, and book amounts before reconciling.`,
        actionLabel: 'Review book capital',
        fieldKey: 'book_capital_account',
      }
    case 'unresolved-source-conflicts':
      return {
        title: 'Source conflicts require a decision',
        description: 'Two sources disagree for one or more fields. Open the reviewed source K-1 and choose which value should be authoritative before reconciling.',
      }
    default:
      return {
        title: check.message,
        description: isReconciliationBlocker(check)
          ? 'This required check must pass before the year can be reconciled.'
          : 'Review the supporting source values. If they are correct, acknowledge this calculated warning before reconciliation.',
      }
  }
}

export const focusK1TrackerField = (fieldKey: K1TrackerWritableFieldKey): void => {
  const field = document.querySelector<HTMLElement>(`[data-k1-field="${fieldKey}"]`)
  field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  field?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')
    ?.focus({ preventScroll: true })
}
