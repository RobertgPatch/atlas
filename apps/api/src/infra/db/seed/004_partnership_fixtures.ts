/**
 * T064 — Seed script: 004 Partnership Fixtures
 * Creates ~50 partnerships across 3 entities with varied statuses,
 * optional finalized K-1s, varied FMV snapshot counts.
 *
 * Run from apps/api:
 *   npx tsx src/infra/db/seed/004_partnership_fixtures.ts
 */
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ASSET_CLASSES = ['Private Equity', 'Real Estate', 'Hedge Fund', 'Venture Capital', 'Credit']
const STATUSES = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED']
const FMV_SOURCES = ['manager_statement', 'valuation_409a', 'k1', 'manual']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

async function upsertEntity(client: pg.PoolClient, name: string, type: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `select id from entities where name = $1`,
    [name],
  )
  if (existing.rows[0]) return existing.rows[0].id

  const id = randomUUID()
  await client.query(
    `insert into entities (id, name, type, created_at, updated_at) values ($1, $2, $3, now(), now())`,
    [id, name, type],
  )
  return id
}

async function getOrCreateAdminUser(client: pg.PoolClient): Promise<string> {
  const res = await client.query<{ id: string }>(
    `select id from users where role = 'Admin' limit 1`,
  )
  if (res.rows[0]) return res.rows[0].id

  const id = randomUUID()
  await client.query(
    `insert into users (id, email, role, created_at, updated_at) values ($1, $2, $3, now(), now())`,
    [id, 'seed-admin@example.com', 'Admin'],
  )
  return id
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const adminId = await getOrCreateAdminUser(client)

    // Create 3 entities
    const entityIds = await Promise.all([
      upsertEntity(client, 'Apex Capital Holdings LLC', 'LP'),
      upsertEntity(client, 'Blue Ridge Investments Fund', 'GP'),
      upsertEntity(client, 'Meridian Partners Group', 'LP'),
    ])

    const partnerships: Array<{ id: string; entityId: string; name: string; status: string }> = []

    // Create ~50 partnerships spread across entities
    for (let i = 0; i < 50; i++) {
      const entityId = entityIds[i % entityIds.length]
      const status = pick(STATUSES)
      const assetClass = pick(ASSET_CLASSES)
      const name = `${assetClass} Fund ${String(i + 1).padStart(2, '0')}`
      const id = randomUUID()

      // Check for duplicate name within entity
      const dup = await client.query(
        `select 1 from partnerships where entity_id = $1 and lower(name) = lower($2)`,
        [entityId, name],
      )
      if (dup.rows.length > 0) continue

      await client.query(
        `insert into partnerships (id, entity_id, name, asset_class, status, notes, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, now(), now())`,
        [
          id,
          entityId,
          name,
          assetClass,
          status,
          i % 5 === 0 ? `Seed notes for ${name}` : null,
        ],
      )
      partnerships.push({ id, entityId, name, status })
    }

    // Add FMV snapshots (varied counts)
    for (let i = 0; i < partnerships.length; i++) {
      const p = partnerships[i]
      const snapshotCount = i % 4 // 0–3 snapshots
      for (let j = 0; j < snapshotCount; j++) {
        const daysBack = (j + 1) * 90
        const date = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
        const amount = p.status === 'LIQUIDATED' && j === snapshotCount - 1
          ? 0
          : randomAmount(100_000, 10_000_000)

        await client.query(
          `insert into partnership_fmv_snapshots
             (id, partnership_id, valuation_date, fmv_amount, source_type, notes, created_by, created_at, updated_at)
           values ($1, $2, $3, $4, $5, null, $6, now(), now())`,
          [randomUUID(), p.id, date, amount, pick(FMV_SOURCES), adminId],
        )
      }
    }

    // Add three same-day FMV snapshots for the first partnership (append-only test)
    if (partnerships[0]) {
      const sameDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      for (let k = 0; k < 3; k++) {
        await client.query(
          `insert into partnership_fmv_snapshots
             (id, partnership_id, valuation_date, fmv_amount, source_type, notes, created_by, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
          [
            randomUUID(),
            partnerships[0].id,
            sameDate,
            randomAmount(500_000, 5_000_000),
            'manual',
            `Same-day snapshot ${k + 1}`,
            adminId,
          ],
        )
      }
    }

    await client.query('COMMIT')
    console.log(`Seeded ${partnerships.length} partnerships across ${entityIds.length} entities.`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

await main()
