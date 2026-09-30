import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  positionFields,
  type CsvDraft,
  type CsvEvidence,
  type CsvField,
  type StatementControl,
  type StatementDraft,
  type StatementField,
  type StatementLocation,
  type StatementParseRecipe,
  type StatementPosition,
} from './liquidity-statement.types.js'

const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const nonnegativeDecimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const version = z.string().trim().min(1).max(100)

const csvLocationSchema = z.object({
  kind: z.literal('CSV'),
  record: z.number().int().positive(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  column: z.number().int().nonnegative().nullable(),
  header: z.string().max(16_384).nullable(),
}).strict().superRefine((location, context) => {
  if (location.lineEnd < location.lineStart) context.addIssue({ code: 'custom', message: 'CSV line span is reversed' })
})

function columnLetters(column: number): string {
  let value = column, result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + value % 26) + result
    value = Math.floor(value / 26)
  }
  return result
}

const xlsxLocationSchema = z.object({
  kind: z.literal('XLSX'),
  sheetId: z.string().trim().min(1).max(256),
  sheetName: z.string().min(1).max(256),
  row: z.number().int().positive(),
  column: z.number().int().positive(),
  address: z.string().regex(/^[A-Z]+[1-9]\d*$/),
  header: z.string().max(16_384).nullable(),
  hidden: z.boolean().optional(),
  filtered: z.boolean().optional(),
}).strict().superRefine((location, context) => {
  if (location.address !== `${columnLetters(location.column)}${location.row}`) {
    context.addIssue({ code: 'custom', message: 'XLSX address does not match row and column' })
  }
})

export const statementLocationSchema = z.union([csvLocationSchema, xlsxLocationSchema])

const derivationSchema = z.object({
  rule: z.string().trim().min(1).max(100),
  version,
  operands: z.array(z.string().trim().min(1).max(500)).max(32),
  estimated: z.boolean(),
}).strict()

const interpretationSchema = z.object({
  rule: z.string().trim().min(1).max(100),
  version,
  sourceFields: z.array(z.string().trim().min(1).max(500)).max(64),
  rounding: z.literal('HALF_AWAY_FROM_ZERO').optional(),
}).strict()

export const statementFieldSchema = z.object({
  value: z.union([z.string().max(16_384), z.boolean(), z.null()]),
  raw: z.array(z.string().max(16_384)).max(64),
  origin: z.enum(['IMPORTED', 'DERIVED', 'REVIEWED', 'UNAVAILABLE']),
  availability: z.enum(['COMPLETE', 'INCOMPLETE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
  evidence: z.array(statementLocationSchema).max(64),
  derivation: derivationSchema.nullable(),
  interpretation: interpretationSchema.nullable(),
  reason: z.string().max(2_000).nullable(),
}).strict().superRefine((field, context) => {
  const mustBeNull = field.availability === 'UNAVAILABLE' || field.availability === 'NOT_APPLICABLE'
  if (mustBeNull && field.value !== null) context.addIssue({ code: 'custom', message: 'Unavailable fields cannot contain values' })
  if (field.availability === 'COMPLETE' && field.value === null) context.addIssue({ code: 'custom', message: 'Complete fields require values' })
})

const controlScopeSchema = z.object({
  kind: z.enum(['COMPLETE_ACCOUNT', 'EXPLICIT_SUBSET', 'UNKNOWN']),
  occurrenceIds: z.array(z.string().trim().min(1).max(200)).max(5_000),
  operandField: z.string().trim().min(1).max(200),
  rule: z.string().trim().min(1).max(100),
  version,
}).strict().superRefine((scope, context) => {
  if (new Set(scope.occurrenceIds).size !== scope.occurrenceIds.length) {
    context.addIssue({ code: 'custom', message: 'Control membership cannot contain duplicates' })
  }
})

export const statementControlSchema = z.object({
  id: z.string().trim().min(1).max(200),
  accountOccurrenceId: z.string().trim().min(1).max(200),
  metric: z.string().trim().min(1).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  reported: statementFieldSchema,
  location: statementLocationSchema,
  scope: controlScopeSchema,
  tolerance: z.string().regex(nonnegativeDecimal),
}).strict()

export const statementRecipeSchema = z.object({
  reader: z.object({ id: z.string().trim().min(1).max(100), version }).strict(),
  registryRevision: version,
  limitsRevision: version,
  adapters: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    version,
    regionId: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(100),
  schemaVersion: z.literal('3.0.0'),
  normalizerVersion: version,
  reconcilerVersion: version,
  classificationCatalogVersion: version,
  accountIdentityVersion: version,
  structuralSelection: z.array(z.string().trim().min(1).max(500)).max(100),
  mapping: z.object({ revision: version, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
}).strict()

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function statementRecipeHash(input: unknown): string {
  const recipe = statementRecipeSchema.parse(input)
  return createHash('sha256').update(canonicalJson(recipe)).digest('hex')
}

const legacyEvidence = (evidence: CsvEvidence): StatementLocation => ({ kind: 'CSV', ...evidence })
const legacyField = (field: CsvField): StatementField => {
  if (field.value !== null && typeof field.value !== 'string' && typeof field.value !== 'boolean') {
    throw new Error('Malformed legacy field value')
  }
  return statementFieldSchema.parse({
    ...structuredClone(field),
    evidence: field.evidence.map(legacyEvidence),
    interpretation: null,
  }) as StatementField
}

const legacyControl = (
  accountOccurrenceId: string,
  id: string,
  metric: string,
  reported: CsvField | undefined,
): StatementControl | null => {
  if (!reported?.value || !reported.evidence[0]) return null
  const field = legacyField(reported)
  return statementControlSchema.parse({
    id,
    accountOccurrenceId,
    metric,
    currency: 'USD',
    reported: field,
    location: field.evidence[0],
    scope: { kind: 'UNKNOWN', occurrenceIds: [], operandField: 'legacyUnknown', rule: 'LEGACY_SCOPE_UNKNOWN', version: '1.0.0' },
    tolerance: '0.01',
  }) as StatementControl
}

export function decodeStoredStatementDraft(input: unknown, storedCanonicalHash: string): {
  sourceSchemaVersion: '2.0.0' | '3.0.0'
  storedCanonicalHash: string
  draft: StatementDraft
} {
  if (!input || typeof input !== 'object') throw new Error('Invalid stored statement draft')
  const stored = structuredClone(input) as CsvDraft | StatementDraft
  if (stored.schemaVersion === '3.0.0') {
    return { sourceSchemaVersion: '3.0.0', storedCanonicalHash, draft: stored }
  }
  if (stored.schemaVersion !== '2.0.0') throw new Error('Unsupported stored statement schema')
  if (!stored.adapter || !Array.isArray(stored.accounts)) throw new Error('Malformed legacy statement draft')

  const controls: StatementControl[] = []
  const accounts = stored.accounts.map((account) => {
    const reported = [
      legacyControl(account.occurrenceId, `${account.occurrenceId}:value`, 'MARKET_VALUE', account.reportedTotal),
      legacyControl(account.occurrenceId, `${account.occurrenceId}:basis`, 'COST_BASIS', account.reportedBasis),
      legacyControl(account.occurrenceId, `${account.occurrenceId}:gain`, 'GAIN', account.reportedGain),
    ].filter((control): control is StatementControl => Boolean(control))
    controls.push(...reported)
    const positions = account.positions.map((position) => {
      const fields = Object.fromEntries(positionFields.map(name => [name, legacyField(position[name])])) as Record<typeof positionFields[number], StatementField>
      return {
        occurrenceId: position.occurrenceId,
        sourceRecord: position.sourceRecord,
        ...fields,
        valuationConvention: {
          priceUnit: 'UNKNOWN', quantityUnit: 'UNKNOWN', multiplier: null,
          accruedInterest: 'UNKNOWN', providerIdentity: null,
        },
      } as StatementPosition
    })
    return {
      occurrenceId: account.occurrenceId,
      identifierFingerprints: account.identifierFingerprints ?? [],
      identifierQuality: account.identifierFingerprints?.length ? 'FULL_RELIABLE' as const : 'MASKED' as const,
      displayName: legacyField(account.displayName),
      accountMask: legacyField(account.accountMask),
      currency: legacyField(account.currency),
      asOfDate: legacyField(account.asOfDate),
      asOfAt: legacyField(account.asOfAt),
      sourceZone: legacyField(account.sourceZone),
      asOfPrecision: account.asOfPrecision,
      completeness: 'REVIEW_REQUIRED' as const,
      sourceSections: [],
      positions,
    }
  })
  return {
    sourceSchemaVersion: '2.0.0',
    storedCanonicalHash,
    draft: {
      schemaVersion: '3.0.0',
      adapter: structuredClone(stored.adapter),
      sourceHash: stored.sourceHash,
      recipe: null,
      recordCounts: structuredClone(stored.recordCounts),
      accounts,
      controls,
      issues: structuredClone(stored.issues),
    },
  }
}

export type { StatementParseRecipe }
