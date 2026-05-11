import { authRepository } from '../../../modules/auth/auth.repository.js'
import { k1Repository } from '../../../modules/k1/k1.repository.js'
import { capitalRepository } from '../../../modules/partnerships/capital.repository.js'

/**
 * Seeds lightweight capital data that powers Feature 006 Portfolio Summary in
 * local/test environments where in-memory repositories are active.
 */
export const seedReportsFixtures = async (): Promise<number> => {
  const admin = authRepository.listUsers().find((user) => user.role === 'Admin')
  if (!admin) throw new Error('No admin user available for reports fixtures')

  const partnerships = k1Repository.listPartnerships()
  let seeded = 0

  for (let idx = 0; idx < partnerships.length; idx++) {
    const partnership = partnerships[idx]!

    const existingCommitments = await capitalRepository.listCommitments(partnership.id)
    if (existingCommitments.length === 0) {
      await capitalRepository.createCommitment(
        partnership.id,
        partnership.entityId,
        {
          commitmentAmountUsd: 1_000_000 + idx * 75_000,
          commitmentDate: '2024-01-15',
          status: 'ACTIVE',
          sourceType: 'manual',
          notes: 'Feature 006 seed commitment',
        },
        admin.id,
        null,
      )

      await capitalRepository.createCapitalActivity(
        partnership.id,
        partnership.entityId,
        {
          activityDate: '2024-03-31',
          eventType: 'funded_contribution',
          amountUsd: 350_000 + idx * 12_500,
          sourceType: 'manual',
          notes: 'Feature 006 seed paid-in',
        },
        admin.id,
        null,
      )

      await capitalRepository.syncActivityDetail(partnership.id, partnership.entityId, {
        preferredYear: 2024,
      })

      seeded += 1
    }
  }

  return seeded
}

const isMain = (() => {
  try {
    return (process.argv[1] ?? '').includes('006_reports_fixtures')
  } catch {
    return false
  }
})()

if (isMain) {
  seedReportsFixtures()
    .then((count) => {
      // eslint-disable-next-line no-console
      console.log(`[reports-fixtures] seeded ${count} partnerships with report fixtures`)
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[reports-fixtures] failed', error)
      process.exitCode = 1
    })
}
