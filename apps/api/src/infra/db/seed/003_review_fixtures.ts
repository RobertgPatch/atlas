/**
 * T074 — Review & Finalization fixture seeder (SC-001).
 *
 * Extends the 002 K-1 perf seeder to populate field values and open issues
 * across key review lifecycle states so that per-state UI snapshot coverage
 * exercises a realistic data shape.
 *
 * States covered per partnership (3 K-1 documents per partnership):
 *   1. NEEDS_REVIEW — all fields low-confidence, 2 OPEN issues
 *   2. READY_FOR_APPROVAL — all fields high-confidence, no issues, approvedByUserId set
 *   3. FINALIZED — high-confidence, no issues, approvedByUserId + finalizedByUserId set
 *
 * Invocation (from the API workspace):
 *   npx tsx src/infra/db/seed/003_review_fixtures.ts
 *
 * Or import `seedReviewFixtures` from application bootstrap behind an env flag.
 */
import { authRepository } from '../../../modules/auth/auth.repository.js'
import { k1Repository } from '../../../modules/k1/k1.repository.js'
import { reviewRepository } from '../../../modules/review/review.repository.js'

/** Seed a standard set of field values for a K-1 document. */
const seedFieldValues = (k1Id: string, highConfidence: boolean) => {
  const score = (hi: boolean, base: number) => (hi ? 0.9 + Math.random() * 0.09 : base)

  reviewRepository.insertFieldValue({
    k1DocumentId: k1Id,
    fieldName: 'partner_name',
    label: 'Partner Name',
    section: 'entityMapping',
    required: true,
    rawValue: 'Family Trust LLC',
    originalValue: 'Family Trust LLC',
    normalizedValue: 'Family Trust LLC',
    reviewerCorrectedValue: null,
    confidenceScore: score(highConfidence, 0.68),
    sourceLocation: { page: 1, bbox: [10, 10, 200, 40] },
    reviewStatus: 'PENDING',
  })
  reviewRepository.insertFieldValue({
    k1DocumentId: k1Id,
    fieldName: 'partnership_name',
    label: 'Partnership Name',
    section: 'partnershipMapping',
    required: true,
    rawValue: 'Acme Partners LP',
    originalValue: 'Acme Partners LP',
    normalizedValue: 'Acme Partners LP',
    reviewerCorrectedValue: null,
    confidenceScore: score(highConfidence, 0.72),
    sourceLocation: { page: 1, bbox: [10, 50, 200, 80] },
    reviewStatus: 'PENDING',
  })
  reviewRepository.insertFieldValue({
    k1DocumentId: k1Id,
    fieldName: 'partnership_ein',
    label: 'Partnership EIN',
    section: 'partnershipMapping',
    required: true,
    rawValue: '12-3456789',
    originalValue: '12-3456789',
    normalizedValue: '12-3456789',
    reviewerCorrectedValue: null,
    confidenceScore: score(highConfidence, 0.55),
    sourceLocation: { page: 1, bbox: [10, 90, 200, 120] },
    reviewStatus: 'PENDING',
  })
  reviewRepository.insertFieldValue({
    k1DocumentId: k1Id,
    fieldName: 'box_1_ordinary_income',
    label: 'Box 1: Ordinary Income',
    section: 'core',
    required: true,
    rawValue: '50000.00',
    originalValue: '50000.00',
    normalizedValue: '50000.00',
    reviewerCorrectedValue: null,
    confidenceScore: score(highConfidence, 0.65),
    sourceLocation: { page: 2, bbox: [50, 10, 250, 40] },
    reviewStatus: 'PENDING',
  })
  reviewRepository.insertFieldValue({
    k1DocumentId: k1Id,
    fieldName: 'box_19a_distribution',
    label: 'Box 19A: Distribution',
    section: 'core',
    required: false,
    rawValue: '10000.00',
    originalValue: '10000.00',
    normalizedValue: '10000.00',
    reviewerCorrectedValue: null,
    confidenceScore: score(highConfidence, 0.8),
    sourceLocation: { page: 2, bbox: [50, 50, 250, 80] },
    reviewStatus: 'PENDING',
  })

  reviewRepository.upsertReportedDistribution(k1Id, '10000.00')
}

export interface SeedReviewFixturesResult {
  /** K-1 IDs in NEEDS_REVIEW state (2 open issues each) */
  needsReview: string[]
  /** K-1 IDs in READY_FOR_APPROVAL state */
  readyForApproval: string[]
  /** K-1 IDs in FINALIZED state */
  finalized: string[]
}

/**
 * Seeds 3 K-1 documents per partnership across the three key review lifecycle
 * states. Returns arrays of document IDs per state.
 *
 * @param partnershipCount - How many partnerships to cover (default: all seeded).
 */
export const seedReviewFixtures = (partnershipCount?: number): SeedReviewFixturesResult => {
  const users = authRepository.listUsers()
  if (users.length < 2) throw new Error('At least 2 users required — bootstrap auth first')
  const uploader = users[0]!
  const approver = users[1]!

  const partnerships = k1Repository.listPartnerships()
  if (partnerships.length === 0) throw new Error('No partnerships seeded — run 002_k1_fixtures first')

  const target = partnershipCount
    ? partnerships.slice(0, partnershipCount)
    : partnerships

  const needsReview: string[] = []
  const readyForApproval: string[] = []
  const finalized: string[] = []

  for (const partnership of target) {
    // 1. NEEDS_REVIEW — low-confidence fields, 2 open issues
    const kNeeds = k1Repository._debugSeedK1({
      partnershipName: partnership.name,
      status: 'NEEDS_REVIEW',
      taxYear: 2024,
      uploaderUserId: uploader.id,
    })
    seedFieldValues(kNeeds.id, false)
    k1Repository.addIssue({
      k1DocumentId: kNeeds.id,
      issueType: 'MISSING_FIELD',
      severity: 'HIGH',
      message: 'Partnership name could not be confirmed against entity registry.',
    })
    k1Repository.addIssue({
      k1DocumentId: kNeeds.id,
      issueType: 'LOW_CONFIDENCE',
      severity: 'MEDIUM',
      message: 'Box 1 ordinary income confidence below threshold.',
    })
    needsReview.push(kNeeds.id)

    // 2. READY_FOR_APPROVAL — high-confidence, no open issues, approved by approver
    const kReady = k1Repository._debugSeedK1({
      partnershipName: partnership.name,
      status: 'READY_FOR_APPROVAL',
      taxYear: 2024,
      uploaderUserId: uploader.id,
    })
    seedFieldValues(kReady.id, true)
    k1Repository._debugSetK1({ id: kReady.id, approvedByUserId: approver.id })
    readyForApproval.push(kReady.id)

    // 3. FINALIZED — high-confidence, finalized by uploader (two-person: approved by approver)
    const kFinal = k1Repository._debugSeedK1({
      partnershipName: partnership.name,
      status: 'FINALIZED',
      taxYear: 2023,
      uploaderUserId: uploader.id,
    })
    seedFieldValues(kFinal.id, true)
    k1Repository._debugSetK1({
      id: kFinal.id,
      approvedByUserId: approver.id,
      finalizedByUserId: uploader.id,
    })
    reviewRepository.upsertPartnershipAnnualActivity({
      entityId: partnership.entityId,
      partnershipId: partnership.id,
      taxYear: 2023,
      reportedDistributionAmount: '10000.00',
      finalizedFromK1DocumentId: kFinal.id,
    })
    finalized.push(kFinal.id)
  }

  return { needsReview, readyForApproval, finalized }
}

// When executed directly via `tsx`, run and print counts.
const isMain = (() => {
  try {
    const entry = process.argv[1] ?? ''
    return entry.includes('003_review_fixtures')
  } catch {
    return false
  }
})()
if (isMain) {
  const result = seedReviewFixtures()
  // eslint-disable-next-line no-console
  console.log(
    `[review-fixtures] seeded ${result.needsReview.length} NEEDS_REVIEW, ` +
      `${result.readyForApproval.length} READY_FOR_APPROVAL, ` +
      `${result.finalized.length} FINALIZED`,
  )
}
