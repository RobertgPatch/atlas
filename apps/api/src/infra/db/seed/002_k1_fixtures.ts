/**
 * T056 — K-1 perf fixture seeder (SC-002).
 *
 * Populates the in-memory `k1Repository` with ~1 000 K-1 documents evenly
 * distributed across the five lifecycle statuses. Used during development to
 * validate that the K-1 Processing Dashboard renders the initial populated
 * state in under 2 seconds (spec §Success Criteria / SC-002).
 *
 * Invocation (from the API workspace):
 *   npx tsx src/infra/db/seed/002_k1_fixtures.ts
 *
 * Or import `seedK1PerfFixtures` from application bootstrap behind an env flag.
 */
import { authRepository } from '../../../modules/auth/auth.repository.js'
import { k1Repository } from '../../../modules/k1/k1.repository.js'
import type { K1Status } from '../../../modules/k1/k1.types.js'

const STATUSES: K1Status[] = [
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'FINALIZED',
]

export const seedK1PerfFixtures = (target = 1000): number => {
  const user = authRepository.listUsers()[0]
  if (!user) throw new Error('No seed user available — bootstrap auth first')

  const partnerships = k1Repository.listPartnerships()
  if (partnerships.length === 0) throw new Error('No partnerships seeded')

  let inserted = 0
  for (let i = 0; i < target; i++) {
    const partnership = partnerships[i % partnerships.length]!
    const status = STATUSES[i % STATUSES.length]!
    const taxYear = 2022 + (i % 3) // spread across 2022-2024
    const issues = status === 'NEEDS_REVIEW' ? 1 + (i % 3) : 0
    const parseError =
      status === 'PROCESSING' && i % 4 === 0
        ? { code: 'PARSE_LOW_CONFIDENCE', message: 'Seeded perf-fixture parse failure.' }
        : undefined

    k1Repository._debugSeedK1({
      partnershipName: partnership.name,
      status,
      taxYear,
      uploaderUserId: user.id,
      issues,
      parseError,
    })
    inserted++
  }
  return inserted
}

// When executed directly via `tsx`, run and print the count.
const isMain = (() => {
  try {
    const entry = process.argv[1] ?? ''
    return entry.includes('002_k1_fixtures')
  } catch {
    return false
  }
})()
if (isMain) {
  const n = seedK1PerfFixtures(Number(process.env.K1_PERF_FIXTURE_COUNT ?? 1000))
  // eslint-disable-next-line no-console
  console.log(`[k1-perf-fixtures] seeded ${n} K-1 rows`)
}
