import type {
  K1TrackerCheckResult,
  K1TrackerSignoffState,
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

export const isK1TrackerYearReconciled = (state: K1TrackerSignoffState): boolean => {
  const reviewedAt = state.reviewedAt ? Date.parse(state.reviewedAt) : Number.NaN
  const invalidatedAt = state.invalidatedAt ? Date.parse(state.invalidatedAt) : Number.NaN
  return Boolean(state.reviewedAt) && (!state.invalidatedAt || reviewedAt > invalidatedAt)
}

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
      if (check.status !== 'INCOMPLETE') {
        return {
          title: 'Section L net income does not tie',
          description: `The K-1 reports ${actual ?? 'a Section L amount'}, while Jackson totals ${expected ?? 'a different amount'} from the verified income, deduction, and nondeductible-expense rows. Do not replace the reported Section L value when it agrees with the PDF. Review the coded Box 13, Box 18C, and statement rows for a missing calculator mapping${check.difference ? `; the current difference is ${money(check.difference)}` : ''}.`,
        }
      }
      return {
        title: 'Section L net income is missing',
        description: 'Enter Part II, Item L current-year net income (loss) exactly as shown on the K-1.',
        actionLabel: 'Enter Section L net income',
        fieldKey: 'section_l_current_year_net_income_loss',
      }
    case 'section-l-ending': {
      const endingWasImportedButBeginningIsMissing = check.status === 'INCOMPLETE'
        && check.actual !== null
        && check.expected === null
      if (endingWasImportedButBeginningIsMissing) {
        return {
          title: 'Section L beginning capital is missing',
          description: `${actual ?? 'The reported ending capital'} was imported from the K-1. Jackson needs Part II, Item L beginning capital to calculate the rollforward and verify that ending amount. Enter zero if the K-1 beginning-capital box is blank and this is the partnership's first tracked year.`,
          actionLabel: 'Enter beginning capital',
          fieldKey: 'section_l_beginning_capital',
        }
      }
      if (check.status !== 'INCOMPLETE') {
        return {
          title: 'Section L ending capital does not tie',
          description: `The K-1 reports ${actual ?? 'an ending capital amount'}, while the rollforward of the verified beginning capital, contributions, net income, other changes, and withdrawals produces ${expected ?? 'a different amount'}. Keep the reported ending amount when it agrees with the PDF; review the rollforward inputs or any missing coded-row mapping${check.difference ? ` for the ${money(check.difference)} difference` : ''}.`,
          actionLabel: 'Review Section L rollforward',
          fieldKey: 'section_l_beginning_capital',
        }
      }
      return {
        title: 'Section L ending capital is missing',
        description: 'Enter Part II, Item L ending capital account exactly as shown on the K-1.',
        actionLabel: 'Enter ending capital',
        fieldKey: 'section_l_ending_capital',
      }
    }
    case 'book-tax-unexplained':
      return {
        title: check.status === 'INCOMPLETE' ? 'Ending book capital is missing' : 'Book-to-tax difference is not fully explained',
        description: check.status === 'INCOMPLETE'
          ? 'Enter ending book capital from the supporting capital statement. If book capital differs from outside tax basis, add the supported Section 704(c), Section 754, timing, or permanent differences below.'
          : `This does not mean the K-1 capital value is wrong. Ending book capital minus calculated outside tax basis is ${actual ?? 'different'}, while supported reconciling items currently explain ${expected ?? '$0'}. The remaining ${money(check.difference) ?? 'difference'} usually points to a missing basis input such as a coded deduction, nondeductible expense, distribution, or opening-basis adjustment. Add a reconciling item only when you have independent support for it.`,
        actionLabel: check.status === 'INCOMPLETE' ? 'Enter book capital' : 'Review basis inputs',
        fieldKey: check.status === 'INCOMPLETE' ? 'book_capital_account' : 'opening_outside_basis',
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
