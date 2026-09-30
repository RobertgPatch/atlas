import type { StatementFileKind } from './liquidity-statement.types.js'

interface EvidenceCell { column: number; header: string | null; lexical: string | null }
interface EvidenceRecord { ordinal: number; role: string; cells: EvidenceCell[] }
interface EvidencePolicy {
  accountColumns: ReadonlySet<number>
  approvedEvidenceColumns: ReadonlySet<number>
  projection?: 'PERSISTENCE' | 'MAPPING_PREVIEW' | 'LEGACY_RESPONSE'
}

const maskAccountMaterial = (value: string): string => value.replace(
  /(?<![\p{L}\p{N}])(?:[•*xX\d][\s-]*){4,}[\p{L}\p{N}]?(?![\p{L}\p{N}])/gu,
  token => {
    const compact = token.replace(/[\s-]/gu, '')
    const suffix = compact.match(/([\p{L}\p{N}]{1,4})$/u)?.[1] ?? ''
    return `••••${suffix}`
  },
)

/** Routine evidence is allowlisted. Account-bearing cells are retained only in
 * masked form and unclassified metadata is available solely from the protected
 * original, never copied into drafts or ordinary API responses. */
export function minimizeStatementRecord<T extends EvidenceRecord>(record: T, policy: EvidencePolicy): T {
  const cells = record.cells.flatMap(cell => {
    if (policy.accountColumns.has(cell.column)) {
      return [{ ...cell, lexical: cell.lexical === null ? null : maskAccountMaterial(cell.lexical) }]
    }
    return policy.approvedEvidenceColumns.has(cell.column) ? [{ ...cell }] : []
  })
  return { ...record, cells }
}

export const sanitizeStatementFilename = (_sourceName: string, kind: StatementFileKind): string =>
  `statement.${kind === 'XLSX' ? 'xlsx' : 'csv'}`
