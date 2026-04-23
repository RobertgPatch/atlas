import { createTestFixture, sessionCookieFor, type TestFixture } from './testApp.js'
import { k1Repository } from '../../src/modules/k1/k1.repository.js'
import {
  reviewRepository,
  type K1FieldValueRecord,
} from '../../src/modules/review/review.repository.js'
import type { K1Status } from '../../src/modules/review/review.types.js'

export interface ReviewFixture extends TestFixture {
  k1NeedsReview: string
  k1ReadyForApproval: string
  k1Finalized: string
  // Helper accessors
  fieldIdsForK1(k1Id: string): string[]
  fieldByName(k1Id: string, name: string): K1FieldValueRecord | undefined
}

const seedFields = (k1Id: string, overrides: Partial<{ setHighConfidence: boolean }> = {}) => {
  const hi = overrides.setHighConfidence ?? false

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
    confidenceScore: hi ? 0.95 : 0.82,
    sourceLocation: { page: 1, bbox: [10, 10, 200, 40] },
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
    confidenceScore: 0.78,
    sourceLocation: { page: 1, bbox: [10, 50, 200, 80] },
    reviewStatus: 'PENDING',
  })
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
    confidenceScore: 0.91,
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
    confidenceScore: 0.88,
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
    confidenceScore: 0.93,
    sourceLocation: { page: 2, bbox: [50, 50, 250, 80] },
    reviewStatus: 'PENDING',
  })

  reviewRepository.upsertReportedDistribution(k1Id, '10000.00')
}

export const createReviewFixture = async (): Promise<ReviewFixture> => {
  const base = await createTestFixture()
  reviewRepository._debugReset()

  // Ensure both admin and user are memberships on all seeded entities.
  k1Repository._debugSetMemberships(
    base.admin.id,
    base.entityIds,
  )
  k1Repository._debugSetMemberships(base.user.id, base.entityIds)

  const partnership = base.partnerships[0]!

  const kNeeds = k1Repository._debugSeedK1({
    partnershipName: partnership.name,
    status: 'NEEDS_REVIEW',
    taxYear: 2024,
    uploaderUserId: base.admin.id,
  })
  seedFields(kNeeds.id)

  const kReady = k1Repository._debugSeedK1({
    partnershipName: partnership.name,
    status: 'READY_FOR_APPROVAL',
    taxYear: 2024,
    uploaderUserId: base.admin.id,
  })
  seedFields(kReady.id, { setHighConfidence: true })
  // Simulate an Admin who already approved this K-1 (other-actor so finalize can proceed).
  k1Repository._debugSetK1({ id: kReady.id, approvedByUserId: base.user.id })

  const kFinal = k1Repository._debugSeedK1({
    partnershipName: partnership.name,
    status: 'FINALIZED',
    taxYear: 2023,
    uploaderUserId: base.admin.id,
  })
  seedFields(kFinal.id, { setHighConfidence: true })
  k1Repository._debugSetK1({
    id: kFinal.id,
    approvedByUserId: base.user.id,
    finalizedByUserId: base.admin.id,
  })

  return {
    ...base,
    k1NeedsReview: kNeeds.id,
    k1ReadyForApproval: kReady.id,
    k1Finalized: kFinal.id,
    fieldIdsForK1: (k1Id) =>
      reviewRepository.listFieldValuesForK1(k1Id).map((f) => f.id),
    fieldByName: (k1Id, name) =>
      reviewRepository.listFieldValuesForK1(k1Id).find((f) => f.fieldName === name),
  }
}

export { sessionCookieFor }
