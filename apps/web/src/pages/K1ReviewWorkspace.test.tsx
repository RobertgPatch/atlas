import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { K1ReviewSession } from '../../../../packages/types/src/review-finalization'
import { K1ReviewWorkspace } from './K1ReviewWorkspace'

const mocks = vi.hoisted(() => {
  class MockK1Error extends Error {
    status = 409
    currentVersion?: number
    code: string

    constructor(code = 'STALE_TRACKER_REVISION', currentVersion?: number) {
      super(code)
      this.code = code
      this.currentVersion = currentVersion
    }
  }

  return {
    sessionData: null as K1ReviewSession | null,
    refetch: vi.fn(),
    save: vi.fn(),
    resolveIssue: vi.fn(),
    resolveMatch: vi.fn(),
    finalize: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    retry: vi.fn(),
    MockK1Error,
  }
})

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: 'Administrator', user: { email: 'admin@example.com' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../components/shared/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock('../components/shared/PageHeader', () => ({ PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => <header><h1>{title}</h1><p>{subtitle}</p></header> }))
vi.mock('../components/shared/StatusBadge', () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }))
vi.mock('../features/review/components/PdfPanel', () => ({ PdfPanel: ({ pdfUrl, title }: { pdfUrl: string; title: string }) => <aside aria-label="Source PDF">{title} · {pdfUrl}</aside> }))
vi.mock('../features/review/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: vi.fn() }))
vi.mock('../features/k1/hooks/useK1Queries', () => ({ useRetryK1Extraction: () => ({ mutateAsync: mocks.retry, isPending: false }) }))
vi.mock('../features/review/hooks/useReviewSession', () => ({
  K1ApiError: mocks.MockK1Error,
  K1ReviewError: mocks.MockK1Error,
  useReviewSession: () => ({ data: mocks.sessionData, isLoading: false, isError: false, refetch: mocks.refetch }),
  useSaveCorrections: () => ({ mutateAsync: mocks.save }),
  useResolveIssue: () => ({ mutateAsync: mocks.resolveIssue }),
  useResolveMatch: () => ({ mutateAsync: mocks.resolveMatch }),
  useFinalizeK1: () => ({ mutateAsync: mocks.finalize }),
  useK1ApplyPreview: () => ({ mutateAsync: mocks.preview }),
  useApplyK1: () => ({ mutateAsync: mocks.apply }),
}))

const entityId = '71111111-1111-4111-8111-111111111111'
const partnershipId = '81111111-1111-4111-8111-111111111111'
const documentId = '11111111-1111-4111-8111-111111111111'
const codedFieldId = '31111111-1111-4111-8111-111111111111'

const field = (overrides: Partial<K1ReviewSession['fields']['core'][number]> = {}): K1ReviewSession['fields']['core'][number] => ({
  id: '21111111-1111-4111-8111-111111111111',
  fieldName: 'official.part_i_a_partnership_ein',
  canonicalPath: 'official.part_i_a_partnership_ein',
  label: 'Partnership EIN',
  section: 'core',
  required: true,
  rawValue: '12-3456789',
  normalizedValue: '12-3456789',
  reviewerCorrectedValue: null,
  rawValueJson: '12-3456789',
  normalizedValueJson: '12-3456789',
  effectiveValueJson: '12-3456789',
  valueKind: 'STRING',
  confidenceScore: 0.99,
  confidenceBand: 'high',
  sourceLocation: { page: 1, bbox: [5, 5, 20, 10] },
  sourceLocations: [{ page: 1, bbox: [5, 5, 20, 10] }],
  reviewStatus: 'PENDING',
  isModified: false,
  linkedIssueIds: [],
  updatedAt: '2026-08-18T12:00:00.000Z',
  ...overrides,
})

const baseSession = (): K1ReviewSession => ({
  k1DocumentId: documentId,
  version: 7,
  status: 'NEEDS_REVIEW',
  partnership: { id: partnershipId, name: 'Iron Triangle', rawName: 'IRON TRIANGLE' },
  entity: { id: entityId, name: 'Jackson Trust' },
  taxYear: 2025,
  uploadedAt: '2026-08-18T12:00:00.000Z',
  approvedByUserId: null,
  finalizedByUserId: null,
  fields: {
    entityMapping: [field({
      id: '21111111-1111-4111-8111-111111111112',
      fieldName: 'match.partner_name',
      canonicalPath: 'match.partner_name',
      label: 'Partner name',
      section: 'entityMapping',
      rawValue: 'Jackson Trust',
      normalizedValue: 'Jackson Trust',
      rawValueJson: 'Jackson Trust',
      normalizedValueJson: 'Jackson Trust',
      effectiveValueJson: 'Jackson Trust',
    })],
    partnershipMapping: [field({
      id: '21111111-1111-4111-8111-111111111113',
      fieldName: 'match.partnership_name',
      canonicalPath: 'match.partnership_name',
      label: 'Partnership name',
      section: 'partnershipMapping',
      rawValue: 'IRON TRIANGLE',
      normalizedValue: 'IRON TRIANGLE',
      rawValueJson: 'IRON TRIANGLE',
      normalizedValueJson: 'IRON TRIANGLE',
      effectiveValueJson: 'IRON TRIANGLE',
    })],
    core: [
      field({
        id: codedFieldId,
        fieldName: 'official.box_13_entries',
        canonicalPath: 'official.box_13_entries',
        label: 'Box 13 entry',
        required: false,
        valueKind: 'CODE_ROW',
        rawValue: 'W 45',
        normalizedValue: 'W 45',
        rawValueJson: { code: 'W', value: 45 },
        normalizedValueJson: { code: 'W', value: 45 },
        effectiveValueJson: { code: 'W', value: 45 },
        confidenceScore: 0.74,
        confidenceBand: 'medium',
        sourceLocation: { page: 2, bbox: [10, 20, 30, 25] },
        sourceLocations: [{ page: 2, bbox: [10, 20, 30, 25] }],
        linkedIssueIds: ['51111111-1111-4111-8111-111111111111'],
      }),
      field(),
      field({
        id: '21111111-1111-4111-8111-111111111114',
        fieldName: 'official.part_ii_j_profit_beginning_pct',
        canonicalPath: 'official.part_ii_j_profit_beginning_pct',
        label: 'Profit beginning',
        required: false,
        rawValue: '25',
        normalizedValue: '25',
        rawValueJson: 25,
        normalizedValueJson: 25,
        effectiveValueJson: 25,
      }),
      field({
        id: '21111111-1111-4111-8111-111111111115',
        fieldName: 'official.part_ii_j_loss_beginning_pct',
        canonicalPath: 'official.part_ii_j_loss_beginning_pct',
        label: 'Loss beginning',
        required: false,
        rawValue: '25',
        normalizedValue: '25',
        rawValueJson: 25,
        normalizedValueJson: 25,
        effectiveValueJson: 25,
      }),
      field({
        id: '21111111-1111-4111-8111-111111111116',
        fieldName: 'official.part_ii_j_capital_beginning_pct',
        canonicalPath: 'official.part_ii_j_capital_beginning_pct',
        label: 'Capital beginning',
        required: false,
        rawValue: '25',
        normalizedValue: '25',
        rawValueJson: 25,
        normalizedValueJson: 25,
        effectiveValueJson: 25,
      }),
    ],
  },
  issues: [{
    id: '51111111-1111-4111-8111-111111111111',
    k1FieldValueId: codedFieldId,
    issueType: 'LOW_CONFIDENCE',
    issueCode: 'LOW_CONFIDENCE',
    severity: 'MEDIUM',
    status: 'OPEN',
    message: 'Verify the extracted Box 13 value.',
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: '2026-08-18T12:00:00.000Z',
  }],
  reportedDistributionAmount: null,
  pdfUrl: `/k1-documents/${documentId}/pdf`,
  canApprove: false,
  canFinalize: false,
  canEdit: true,
  approveBlockingReasons: ['OPEN_ISSUES'],
  finalizeBlockingReasons: ['OPEN_ISSUES'],
  activeAttempt: {
    id: '61111111-1111-4111-8111-111111111111',
    attemptNumber: 1,
    provider: 'AWS_BDA',
    status: 'SUCCEEDED',
    blueprintVersion: 'k1-v1',
    schemaVersion: '1',
    startedAt: '2026-08-18T12:00:00.000Z',
    completedAt: '2026-08-18T12:01:00.000Z',
    error: null,
  },
  matchCandidates: [],
  canApply: false,
  applyBlockingReasons: ['OPEN_ISSUES', 'REVIEW_NOT_FINALIZED'],
  appliedTrackerYearId: null,
  appliedAt: null,
  appliedByEmail: null,
})

const preview = {
  applicationId: 'application-1',
  k1DocumentId: documentId,
  expectedDocumentVersion: 9,
  trackerYearId: 'tracker-year-1',
  expectedTrackerRevision: 3,
  expiresAt: '2026-08-18T13:00:00.000Z',
  decisions: [
    { id: 'decision-income', destinationKind: 'CALCULATION', destinationKey: 'box_1_ordinary_income_loss', extractedValue: 125, existingValue: 100, defaultDecision: 'KEEP_EXISTING', conflict: true, sourceFieldValueIds: [] },
    { id: 'decision-distribution', destinationKind: 'CALCULATION', destinationKey: 'box_19_distributions', extractedValue: 600, existingValue: 500, defaultDecision: 'KEEP_EXISTING', conflict: true, sourceFieldValueIds: [] },
    { id: 'decision-official', destinationKind: 'OFFICIAL', destinationKey: 'k1_status_final', extractedValue: true, existingValue: null, defaultDecision: 'USE_EXTRACTED', conflict: false, sourceFieldValueIds: [] },
  ],
} as const

const renderWorkspace = (session = baseSession()) => {
  mocks.sessionData = session
  return render(<MemoryRouter initialEntries={[`/k1/${documentId}/review`]}><Routes><Route path="/k1/:id/review" element={<K1ReviewWorkspace />} /></Routes></MemoryRouter>)
}

describe('K1ReviewWorkspace simplified scan flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessionData = baseSession()
    mocks.refetch.mockImplementation(async () => ({ data: mocks.sessionData }))
    mocks.save.mockResolvedValue({ version: 8 })
    mocks.resolveIssue.mockResolvedValue({ version: 8 })
    mocks.resolveMatch.mockResolvedValue({ documentVersion: 8 })
    mocks.finalize.mockResolvedValue({ version: 9 })
    mocks.preview.mockResolvedValue(preview)
    mocks.apply.mockResolvedValue({
      applicationId: 'application-1',
      k1DocumentId: documentId,
      status: 'APPLIED',
      trackerYearId: 'tracker-year-1',
      trackerRevision: 4,
      appliedAt: '2026-08-18T12:10:00.000Z',
      invalidatedTaxYears: [2025],
    })
  })

  it('presents one ordered verification screen and one save action', async () => {
    renderWorkspace()

    expect(await screen.findByText('One review, one save')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part I - Partnership information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part II - Information about the partner' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Part III - Partner's share of current-year items" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Double-check 1 extracted value' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check Part III · Line 13 · Code W' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save verified K-1 to tax basis' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /This K-1 is the partnership’s inception year/i })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save verified K-1 to tax basis' })).toHaveClass(
      'bg-primary',
      'hover:bg-primary-hover',
    )
    expect(screen.queryByRole('button', { name: /finalize/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /build.*preview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /flag an issue/i })).not.toBeInTheDocument()

    const partTwo = screen.getByRole('heading', { name: 'Part II - Information about the partner' }).closest('section')!
    const fieldOrder = Array.from(partTwo.querySelectorAll('[data-testid^="field-row-"]'))
      .map((row) => row.getAttribute('data-testid'))
    expect(fieldOrder).toEqual([
      'field-row-official.part_ii_j_profit_beginning_pct',
      'field-row-official.part_ii_j_loss_beginning_pct',
      'field-row-official.part_ii_j_capital_beginning_pct',
    ])
  })

  it('acknowledges extraction flags, finalizes, previews, and applies with one click', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole('button', { name: 'Save verified K-1 to tax basis' }))

    await screen.findByRole('heading', { name: 'K-1 saved to tax basis' })
    expect(mocks.resolveIssue).toHaveBeenCalledWith({
      issueId: '51111111-1111-4111-8111-111111111111',
      version: 7,
      body: { acceptExtractedValue: true, acknowledgement: 'Verified against the source PDF.' },
    })
    expect(mocks.finalize).toHaveBeenCalledWith({ version: 8 })
    expect(mocks.preview).toHaveBeenCalledWith({ expectedDocumentVersion: 9 })
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({
      decisions: [
        { decisionId: 'decision-income', decision: 'USE_EXTRACTED' },
        { decisionId: 'decision-distribution', decision: 'KEEP_EXISTING' },
        { decisionId: 'decision-official', decision: 'USE_EXTRACTED' },
      ],
    }))
  })

  it('saves a corrected repeated-row amount before completing the same flow', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    const amount = await screen.findByRole('textbox', { name: 'Part III · Line 13 · Code W amount' })
    await user.clear(amount)
    await user.type(amount, '99')
    await user.click(screen.getByRole('button', { name: 'Save verified K-1 to tax basis' }))

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
      body: { corrections: [{ fieldValueId: codedFieldId, value: { code: 'W', value: '99' } }] },
      version: 7,
    }))
    await screen.findByRole('heading', { name: 'K-1 saved to tax basis' })
  })

  it('applies inception-year defaults when the reviewer selects the upload option', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('checkbox', { name: /This K-1 is the partnership’s inception year/i }))
    await user.click(screen.getByRole('button', { name: 'Save verified K-1 to tax basis' }))

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({
      inceptionYear: true,
    })))
  })

  it('blocks the single save button until a required extracted value is completed', async () => {
    const session = baseSession()
    session.fields.core = session.fields.core.map((item) => item.canonicalPath === 'official.part_i_a_partnership_ein'
      ? { ...item, normalizedValue: null, normalizedValueJson: null, effectiveValueJson: null, rawValue: null, rawValueJson: null }
      : item)
    renderWorkspace(session)

    expect(await screen.findByRole('button', { name: 'Complete 1 required field' })).toBeDisabled()
  })

  it('opens the saved partnership year directly in K-1 history from the top and bottom actions', async () => {
    const user = userEvent.setup()
    const session = baseSession()
    session.status = 'FINALIZED'
    session.appliedAt = '2026-08-18T12:10:00.000Z'
    mocks.sessionData = session

    const Location = () => <div data-testid="location">{useLocation().search}</div>
    render(<MemoryRouter initialEntries={[`/k1/${documentId}/review`]}><Routes>
      <Route path="/k1/:id/review" element={<K1ReviewWorkspace />} />
      <Route path="/investment-tracker" element={<Location />} />
    </Routes></MemoryRouter>)

    const historyButtons = await screen.findAllByRole('button', { name: /Open K-1 history/i })
    expect(historyButtons).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'K-1 history navigation' })).toHaveTextContent('manual inputs')

    await user.click(historyButtons.at(-1)!)
    const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '')
    expect(params.get('partnership')).toBe(partnershipId)
    expect(params.get('year')).toBe('2025')
    expect(params.get('area')).toBe('k1-history')
  })

  it('explains a stale tax-basis revision instead of exposing an internal code', async () => {
    const user = userEvent.setup()
    mocks.preview.mockRejectedValue(new mocks.MockK1Error('STALE_TRACKER_REVISION'))
    renderWorkspace()

    await user.click(await screen.findByRole('button', { name: 'Save verified K-1 to tax basis' }))

    expect(await screen.findByTestId('stale-banner')).toHaveTextContent('changed while you were reviewing it')
    expect(screen.queryByText('STALE_TRACKER_REVISION')).not.toBeInTheDocument()
  })
})
