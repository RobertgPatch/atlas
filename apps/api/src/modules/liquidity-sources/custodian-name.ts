import type { Db } from './liquidity-source.repository.js'

export const normalizeCustodianName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ')

export const custodianNameKey = (value: string) =>
  normalizeCustodianName(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')

/** Reuse saved display spelling for case, whitespace and punctuation variants. */
export async function resolveCustodianName(entityId: string, requested: string, db: Db) {
  const normalized = normalizeCustodianName(requested)
  const key = custodianNameKey(normalized)
  const rows = (await db.query(`select custodian from (
    select custodian,0 as priority from liquidity_source_accounts where entity_id=$1
    union all
    select custodian,1 as priority from liquidity_csv_imports where entity_id=$1 and status not in ('CANCELLED','REJECTED')
  ) names order by priority,custodian`, [entityId])).rows
  return rows.map(row => String(row.custodian)).find(name => custodianNameKey(name) === key) ?? normalized
}
