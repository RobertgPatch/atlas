import { z } from 'zod'
import { mappingTargets, positionFields } from './liquidity-statement.types.js'

export const decimalString = z.string().regex(/^-?(0|[1-9][0-9]{0,19})(\.[0-9]{1,8})?$/)
export const ratioString = z.string().regex(/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,12})?$/)
export const uuid = z.string().uuid()
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
export const currency = z.string().regex(/^[A-Z]{3}$/)
export const expectedVersion = z.number().int().positive()
export const cadence = z.enum(['EVERY_14_DAYS', 'CALENDAR_MONTHLY', 'ON_DEMAND'])
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)
export const uploadRequestSchema = z.object({ entityId: uuid, custodian: z.string().trim().min(1).max(120), fileName: z.string().min(1).max(255), sizeBytes: z.number().int().min(1).max(10485760), sha256, contentType: z.enum(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']), profileId: z.enum(['positions_v1', 'merrill_holdings_v1']).optional() }).strict()
export const completeSchema = z.object({ expectedVersion, storageVersionId: z.string().min(1).max(1024), sha256 }).strict()
export const mappingProfileSchema = z.object({
  name: z.string().trim().min(1).max(120), delimiter: z.enum([',', ';', '\t']), encoding: z.enum(['UTF8', 'UTF16LE', 'UTF16BE', 'WINDOWS1252']), headerRecord: z.number().int().min(1).max(101), dateFormat: z.enum(['M/D/YYYY', 'YYYY/MM/DD', 'YYYY-MM-DD', 'PROFILE_TITLE']), sourceZone: z.string().max(100).optional(), percentUnit: z.enum(['PERCENT_POINTS', 'RATIO']), currency, asOfDate: dateString.optional(), columns: z.array(z.object({ sourceIndex: z.number().int().min(0).max(127), sourceHeader: z.string().max(16384), target: z.enum(mappingTargets) }).strict()).min(1).max(128),
}).strict().superRefine((v, ctx) => {
  const targets = v.columns.filter(c => c.target !== 'ignoredEvidence').map(c => c.target)
  if (new Set(targets).size !== targets.length || new Set(v.columns.map(c => c.sourceIndex)).size !== v.columns.length) ctx.addIssue({ code: 'custom', message: 'DUPLICATE_MAPPING' })
  if (!targets.includes('marketValue')) ctx.addIssue({ code: 'custom', message: 'MISSING_VALUE_MAPPING' })
})
export const accountBindingSchema = z.object({ occurrenceId: z.string().min(1).max(120), accountId: uuid, expectedAccountVersion: expectedVersion, completeAccount: z.literal(true), emptyAccountConfirmed: z.boolean(), emptyReason: z.string().trim().min(1).max(2000).optional(), acknowledgedIssueIds: z.array(uuid).max(100000).optional(), effectiveOrderDecision: z.object({ kind: z.enum(['SOURCE_ORDER', 'HISTORICAL_ONLY', 'CORRECTION']), replacesSnapshotId: uuid.optional(), reason: z.string().trim().min(1).max(2000) }).strict().optional() }).strict()
export const accountBindings = z.array(accountBindingSchema).min(1).max(100).refine(v => new Set(v.map(b => b.occurrenceId)).size === v.length && new Set(v.map(b => b.accountId)).size === v.length)
const accountFields = ['displayName', 'currency', 'asOfDate', 'asOfAt', 'sourceZone', 'reportedTotal', 'reportedBasis', 'reportedGain']
export const reviewSchema = z.object({ expectedVersion, changes: z.array(z.object({ fieldPath: z.string().max(250).refine(path => {
  const m = /^accounts\.(\d{1,3})\.(?:(?:positions\.(\d{1,5})\.)([A-Za-z]+)|([A-Za-z]+))$/.exec(path)
  return !!m && (m[3] ? (positionFields as readonly string[]).includes(m[3]) : accountFields.includes(m[4]!))
}), value: z.union([z.string().max(16384), z.boolean(), z.null()]), reason: z.string().trim().min(1).max(2000) }).strict()).max(25000), accountBindings }).strict()
export const previewSchema = z.object({ expectedVersion, accountBindings }).strict()
export const applySchema = z.object({ previewId: uuid, expectedVersion, summaryHash: sha256, idempotencyKey: z.string().min(1).max(128) }).strict()
export const mappingSchema = z.object({ expectedVersion, profile: mappingProfileSchema }).strict()
export const versionSchema = z.object({ expectedVersion }).strict()
export const createAccountSchema = z.object({ entityId: uuid, custodian: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(120), accountMask: z.string().regex(/^[A-Za-z0-9]{1,4}$/).optional(), currency, cadence: cadence.default('ON_DEMAND') }).strict()
export const updateAccountSchema = z.object({ expectedVersion, name: z.string().trim().min(1).max(120).optional(), included: z.boolean().optional(), cadence: cadence.optional() }).strict()
