import type { Db } from './liquidity-source.repository.js'

export const normalizeCustodianName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ')

export const custodianNameKey = (value: string) =>
  normalizeCustodianName(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')

const displayNameScore = (value: string) => {
  const normalized = normalizeCustodianName(value)
  const hasUppercase = /\p{Lu}/u.test(normalized)
  const hasLowercase = /\p{Ll}/u.test(normalized)
  return Number(hasUppercase) + Number(hasUppercase && hasLowercase)
}

/** Prefer a readable saved spelling while treating case and punctuation variants as one custodian. */
export function preferredCustodianName(values: readonly string[]): string {
  return [...values]
    .map(normalizeCustodianName)
    .sort((left,right)=>displayNameScore(right)-displayNameScore(left)||left.localeCompare(right,'en-US',{sensitivity:'variant'}))[0] ?? ''
}

/** Reuse saved display spelling for case, whitespace and punctuation variants. */
export async function resolveCustodianName(entityId: string, requested: string, db: Db) {
  const normalized = normalizeCustodianName(requested)
  const key = custodianNameKey(normalized)
  const rows = (await db.query(`select custodian from (
    select custodian,0 as priority from liquidity_source_accounts where entity_id=$1 and archived_at is null
    union all
    select custodian,1 as priority from liquidity_csv_imports where entity_id=$1 and archived_at is null and status not in ('CANCELLED','REJECTED')
  ) names order by priority,custodian`, [entityId])).rows
  return rows.map(row => String(row.custodian)).find(name => custodianNameKey(name) === key) ?? normalized
}
