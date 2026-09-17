import { randomUUID } from 'node:crypto'

import { query, withTransaction } from '../../../infra/db/client.js'
import { auditRepository } from '../../audit/audit.repository.js'
import { durableReviewRepository, type DurableK1FieldValueRecord } from '../../review/review.repository.js'
import { durableK1BatchRepository } from '../k1.repository.js'
import {
  normalizeRecordName,
  normalizeTaxIdentifier,
  type K1MatchProposal,
} from './k1Matcher.service.js'

interface K1PartnershipImportContext {
  actorUserId: string
  entityScopeId: string
}

interface ExistingPartnershipRow {
  id: string
  name: string
  ein: string | null
}

interface PartnershipAddress {
  line1: string
  line2: string | null
  city: string
  region: string
  postalCode: string
  country: string
}

export type K1PartnershipImportResult =
  | { action: 'NOT_REQUESTED' | 'REQUIRES_REVIEW' }
  | { action: 'CREATED' | 'EXISTING'; entityScopeId: string; partnershipId: string }

const effectiveValue = (field: DurableK1FieldValueRecord): unknown =>
  field.reviewerCorrectedValueJson
  ?? field.normalizedValueJson
  ?? field.normalizedValue
  ?? field.rawValueJson
  ?? field.rawValue

const signalField = (
  fields: DurableK1FieldValueRecord[],
  key: string,
): DurableK1FieldValueRecord | undefined => fields.find(
  (field) => field.destinationKind === 'MATCH_SIGNAL' && field.destinationKey === key,
)

const reliable = (field: DurableK1FieldValueRecord | undefined): boolean =>
  field?.reviewerCorrectedValueJson != null
  || field?.reviewerCorrectedValue != null
  || (field?.confidenceScore != null && field.confidenceScore >= 0.8)

const textValue = (field: DurableK1FieldValueRecord | undefined): string | null => {
  const value = field ? effectiveValue(field) : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : null
}

const formattedEin = (digits: string | null): string | null =>
  digits ? `${digits.slice(0, 2)}-${digits.slice(2)}` : null

const partnershipAddress = (
  fields: DurableK1FieldValueRecord[],
  partnershipName: string,
): PartnershipAddress | null => {
  const field = fields.find(
    (candidate) => candidate.canonicalPath === 'official.part_i_b_partnership_name_address',
  )
  if (!field || !reliable(field)) return null
  const value = effectiveValue(field)
  if (typeof value !== 'string') return null
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 3 || normalizeRecordName(lines[0]) !== normalizeRecordName(partnershipName)) return null
  lines.shift()
  let country = 'United States'
  if (/^(?:united states(?: of america)?|u\.?s\.?a?\.?)$/i.test(lines.at(-1) ?? '')) {
    country = lines.pop()!
  }
  const locality = /^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(lines.pop() ?? '')
  if (!locality || lines.length < 1) return null
  return {
    line1: lines[0]!.slice(0, 255),
    line2: lines.length > 1 ? lines.slice(1).join(', ').slice(0, 255) : null,
    city: locality[1]!.trim().slice(0, 120),
    region: locality[2]!,
    postalCode: locality[3]!,
    country,
  }
}

export const getK1PartnershipImportContext = async (
  k1DocumentId: string,
): Promise<K1PartnershipImportContext | null> => {
  const result = await query<{
    created_by_user_id: string
    entity_scope_id: string | null
    create_partnership_if_missing: boolean
  }>(
    `select b.created_by_user_id, b.entity_scope_id, b.create_partnership_if_missing
       from k1_ingestion_items i
       join k1_ingestion_batches b on b.id = i.batch_id
      where i.k1_document_id = $1`,
    [k1DocumentId],
  )
  const row = result.rows[0]
  if (!row?.create_partnership_if_missing || !row.entity_scope_id) return null
  return { actorUserId: row.created_by_user_id, entityScopeId: row.entity_scope_id }
}

export const isCompletedK1PartnershipIntake = async (
  sourceK1DocumentId: string,
): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `select exists (
       select 1
         from k1_ingestion_items i
         join k1_ingestion_batches b on b.id = i.batch_id
        where b.create_partnership_if_missing = true
          and i.partnership_intake_source_k1_document_id = $1
          and i.k1_document_id is null
          and i.status in ('APPLIED', 'FAILED')
     ) as exists`,
    [sourceK1DocumentId],
  )
  return result.rows[0]?.exists ?? false
}

/**
 * Finish a partnership-only intake and remove its temporary extraction rows.
 * The batch item retains only the resulting partnership id (or a safe failure)
 * so the PDF never becomes an annual K-1 record.
 */
export const finalizeK1PartnershipIntake = async (args: {
  k1DocumentId: string
  partnershipId: string | null
}): Promise<{ completed: boolean; documentId: string | null }> => withTransaction(async (client) => {
  const intake = await client.query<{
    item_id: string
    batch_id: string
    document_id: string | null
  }>(
    `select i.id as item_id, i.batch_id, i.document_id
       from k1_ingestion_items i
       join k1_ingestion_batches b on b.id = i.batch_id
      where i.k1_document_id = $1
        and b.create_partnership_if_missing = true
      for update of b, i`,
    [args.k1DocumentId],
  )
  const row = intake.rows[0]
  if (!row) return { completed: false, documentId: null }

  await client.query(
    `update k1_ingestion_items
        set document_id = null,
            k1_document_id = null,
            partnership_intake_partnership_id = $2,
            partnership_intake_source_k1_document_id = $3,
            status = $4,
            error_code = $5,
            error_summary = $6,
            updated_at = now()
      where id = $1`,
    [
      row.item_id,
      args.partnershipId,
      args.k1DocumentId,
      args.partnershipId ? 'APPLIED' : 'FAILED',
      args.partnershipId ? null : 'PARTNERSHIP_IMPORT_REQUIRES_REVIEW',
      args.partnershipId
        ? null
        : 'The first page did not identify one partnership safely. No partnership was created.',
    ],
  )

  await client.query(
    `delete from k1_application_field_decisions
      where application_id in (
        select id from k1_document_applications where k1_document_id = $1
      )`,
    [args.k1DocumentId],
  )
  await client.query('delete from k1_document_applications where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_tracker_official_value_revisions where source_k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_tracker_value_revisions where source_k1_document_id = $1', [args.k1DocumentId])
  await client.query(
    'update partnership_annual_activity set finalized_from_k1_document_id = null where finalized_from_k1_document_id = $1',
    [args.k1DocumentId],
  )
  await client.query('delete from k1_field_value_corrections where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_match_candidates where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_issues where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_reported_distributions where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_field_values where k1_document_id = $1', [args.k1DocumentId])
  await client.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [args.k1DocumentId])
  await client.query('delete from k1_extraction_attempts where k1_document_id = $1', [args.k1DocumentId])
  await client.query('delete from k1_documents where id = $1', [args.k1DocumentId])
  if (row.document_id) {
    await client.query(
      'delete from document_versions where original_document_id = $1 or superseded_by_id = $1',
      [row.document_id],
    )
    await client.query('delete from documents where id = $1', [row.document_id])
  }
  await durableK1BatchRepository.recomputeBatch(client, row.batch_id)
  return { completed: true, documentId: row.document_id }
})

/**
 * Create the owner-specific partnership only when page 1 has a reliable fund
 * identity. The owner selected by the administrator is authoritative for this
 * intake; existing EIN/name records under that owner always win.
 */
export const importPartnershipFromK1IfSafe = async (args: {
  k1DocumentId: string
  proposal: K1MatchProposal
  context: K1PartnershipImportContext
}): Promise<K1PartnershipImportResult> => {
  const blocksPartnershipImport = args.proposal.issueCodes.some((code) => [
    'PARTNERSHIP_MATCH_SIGNAL_MISSING',
    'PARTNERSHIP_MATCH_AMBIGUOUS',
    'ENTITY_PARTNERSHIP_CONFLICT',
  ].includes(code)) || args.proposal.candidates.some(
    (candidate) => candidate.type === 'PARTNERSHIP' && candidate.nameContradiction,
  )
  if (blocksPartnershipImport) {
    return { action: 'REQUIRES_REVIEW' }
  }

  const fields = await durableReviewRepository.listForActiveAttempt(args.k1DocumentId)
  const nameField = signalField(fields, 'partnership_name')
  const einField = signalField(fields, 'partnership_ein')
  const name = textValue(nameField)
  const normalizedName = normalizeRecordName(name)
  const ein = normalizeTaxIdentifier(einField ? effectiveValue(einField) : null)
  const address = name ? partnershipAddress(fields, name) : null
  if (!name || !normalizedName || !reliable(nameField)) {
    return { action: 'REQUIRES_REVIEW' }
  }
  if (einField && (!ein || !reliable(einField))) return { action: 'REQUIRES_REVIEW' }

  return withTransaction(async (client) => {
    const current = await client.query<{
      created_by_user_id: string
      entity_scope_id: string | null
      create_partnership_if_missing: boolean
    }>(
      `select b.created_by_user_id, b.entity_scope_id, b.create_partnership_if_missing
         from k1_ingestion_items i
         join k1_ingestion_batches b on b.id = i.batch_id
        where i.k1_document_id = $1
        for update of b`,
      [args.k1DocumentId],
    )
    const request = current.rows[0]
    if (!request?.create_partnership_if_missing || request.entity_scope_id !== args.context.entityScopeId) {
      return { action: 'NOT_REQUESTED' } as const
    }

    // Partnership imports are infrequent. This table lock makes the duplicate
    // check safe against both another K-1 import and a simultaneous manual add.
    await client.query('lock table partnerships in share row exclusive mode')
    const candidates = await client.query<ExistingPartnershipRow>(
      'select id, name, ein from partnerships where entity_id = $1 order by created_at, id',
      [args.context.entityScopeId],
    )
    const duplicates = candidates.rows.filter((candidate) => (
      (ein != null && normalizeTaxIdentifier(candidate.ein) === ein)
      || normalizeRecordName(candidate.name) === normalizedName
    ))
    if (duplicates.length > 1) return { action: 'REQUIRES_REVIEW' } as const
    if (duplicates[0]) {
      return {
        action: 'EXISTING',
        entityScopeId: args.context.entityScopeId,
        partnershipId: duplicates[0].id,
      } as const
    }

    const partnershipId = randomUUID()
    const created = (await client.query(
      `insert into partnerships
         (id, aggregation_group_id, entity_id, name, asset_class, status, ein,
          address_line_1, address_line_2, address_city, address_region,
          address_postal_code, address_country, created_at, updated_at)
       values ($1, $1, $2, $3, 'Other', 'ACTIVE', $4, $5, $6, $7, $8, $9, $10, now(), now())
       returning *`,
      [
        partnershipId,
        args.context.entityScopeId,
        name,
        formattedEin(ein),
        address?.line1 ?? null,
        address?.line2 ?? null,
        address?.city ?? null,
        address?.region ?? null,
        address?.postalCode ?? null,
        address?.country ?? null,
      ],
    )).rows[0]
    await auditRepository.record({
      actorUserId: request.created_by_user_id,
      eventName: 'partnership.created_from_k1',
      objectType: 'partnership',
      objectId: partnershipId,
      before: null,
      after: created,
    }, client)
    return {
      action: 'CREATED',
      entityScopeId: args.context.entityScopeId,
      partnershipId,
    } as const
  })
}
