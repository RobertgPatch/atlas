import type {
  ExtractCtx,
  ExtractFieldValue,
  ExtractResult,
  K1Extractor,
} from './K1Extractor.js'

// V1 stub: deterministic pseudo-extraction driven by the PDF byte count.
// Not a real parser — just exercises the lifecycle contract (FR-019, FR-024, FR-025).
export const stubExtractor: K1Extractor = {
  backend: 'stub',
  async extract(ctx: ExtractCtx): Promise<ExtractResult> {
    // Small artificial delay so the UI can observe the PROCESSING state.
    await new Promise((r) => setTimeout(r, 400))

    if (ctx.simulateFailure) {
      return {
        outcome: 'FAILURE',
        errorCode: 'PARSE_SIMULATED',
        errorMessage: 'Simulated parse failure for development.',
      }
    }

    const openIssueCount = ctx.pdfSizeBytes % 3 // 0, 1, or 2
    const extractedPartnershipName = `Imported Partnership ${String((ctx.pdfSizeBytes % 97) + 1).padStart(2, '0')}`
    const extractedTaxYear = new Date().getFullYear() - 1
    const issues = Array.from({ length: openIssueCount }, (_, i) => ({
      issueType: 'MISSING_FIELD',
      severity: 'MEDIUM' as const,
      message: `Detected missing or low-confidence field #${i + 1}.`,
    }))

    // Deterministic confidence scores based on file size so re-uploads produce stable output.
    const s = ctx.pdfSizeBytes
    const fieldValues: ExtractFieldValue[] = [
      {
        fieldName: 'partner_name',
        label: 'Partner Name',
        section: 'entityMapping',
        required: true,
        rawValue: null, // Needs manual entity mapping — left empty to prompt reviewer
        confidenceScore: 0.4 + (s % 20) * 0.01,
        sourceLocation: { page: 1, bbox: [10, 10, 300, 40] },
      },
      {
        fieldName: 'partnership_name',
        label: 'Partnership Name',
        section: 'partnershipMapping',
        required: true,
        rawValue: extractedPartnershipName,
        confidenceScore: 0.45 + (s % 15) * 0.01,
        sourceLocation: { page: 1, bbox: [10, 50, 300, 80] },
      },
      {
        fieldName: 'partnership_ein',
        label: 'Partnership EIN',
        section: 'partnershipMapping',
        required: true,
        rawValue: `${String(s % 99 + 10).padStart(2, '0')}-${String(s % 9999999 + 1000000).padStart(7, '0')}`,
        confidenceScore: 0.7 + (s % 25) * 0.01,
        sourceLocation: { page: 1, bbox: [10, 90, 300, 120] },
      },
      {
        fieldName: 'box_1_ordinary_income',
        label: 'Box 1: Ordinary Income',
        section: 'core',
        required: true,
        rawValue: `${(s % 200000).toFixed(2)}`,
        confidenceScore: 0.75 + (s % 20) * 0.01,
        sourceLocation: { page: 2, bbox: [50, 10, 350, 40] },
      },
      {
        fieldName: 'box_2_net_rental_real_estate',
        label: 'Box 2: Net Rental Real Estate Income',
        section: 'core',
        required: false,
        rawValue: `${(s % 50000).toFixed(2)}`,
        confidenceScore: 0.8 + (s % 15) * 0.01,
        sourceLocation: { page: 2, bbox: [50, 50, 350, 80] },
      },
      {
        fieldName: 'box_3_other_net_rental_income',
        label: 'Box 3: Other Net Rental Income',
        section: 'core',
        required: false,
        rawValue: '0.00',
        confidenceScore: 0.92,
        sourceLocation: { page: 2, bbox: [50, 90, 350, 120] },
      },
      {
        fieldName: 'box_4_guaranteed_payments',
        label: 'Box 4: Guaranteed Payments',
        section: 'core',
        required: false,
        rawValue: '0.00',
        confidenceScore: 0.91,
        sourceLocation: { page: 2, bbox: [50, 130, 350, 160] },
      },
      {
        fieldName: 'box_19a_distribution',
        label: 'Box 19A: Distribution',
        section: 'core',
        required: false,
        rawValue: `${(s % 100000).toFixed(2)}`,
        confidenceScore: 0.85 + (s % 10) * 0.01,
        sourceLocation: { page: 3, bbox: [50, 10, 350, 40] },
      },
    ]

    return {
      outcome: 'SUCCESS',
      nextStatus: openIssueCount > 0 ? 'NEEDS_REVIEW' : 'READY_FOR_APPROVAL',
      issues,
      fieldValues,
      extractedPartnershipName,
      extractedTaxYear,
    }
  },
}
