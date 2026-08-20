import type pg from 'pg'

import type { DurableK1FieldValueRecord } from '../../review/review.repository.js'

export type K1MatchCandidateType = 'ENTITY' | 'PARTNERSHIP'

export interface K1MatchCandidateProposal {
  type: K1MatchCandidateType
  recordId: string
  recordName: string
  entityId: string
  score: number
  maskedLabel: string
  signals: string[]
  identifierMatch: boolean
  nameContradiction: boolean
}

export interface K1MatchProposal {
  entityId: string | null
  partnershipId: string | null
  taxYear: number | null
  candidates: K1MatchCandidateProposal[]
  issueCodes: string[]
  safeToMatch: boolean
}

export const normalizeTaxIdentifier = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const digits = String(value).replace(/\D/g, '')
  return digits.length === 9 ? digits : null
}

export const maskTaxIdentifier = (value: unknown, type: K1MatchCandidateType): string | null => {
  const digits = normalizeTaxIdentifier(value)
  if (!digits) return null
  return type === 'ENTITY'
    ? `***-**-${digits.slice(-4)}`
    : `**-***${digits.slice(-4)}`
}

export const normalizeRecordName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|lp|llp|ltd|inc|corp|corporation|partnership|trust)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || null
}

const nameScore = (extracted: string | null, candidate: string): number => {
  if (!extracted) return 0
  const normalizedCandidate = normalizeRecordName(candidate)
  if (!normalizedCandidate) return 0
  if (extracted === normalizedCandidate) return 1
  if (extracted.includes(normalizedCandidate) || normalizedCandidate.includes(extracted)) return 0.82
  const left = new Set(extracted.split(' '))
  const right = new Set(normalizedCandidate.split(' '))
  const overlap = [...left].filter((part) => right.has(part)).length
  return overlap === 0 ? 0 : Number((2 * overlap / (left.size + right.size)).toFixed(5))
}

const effectiveValue = (field: DurableK1FieldValueRecord): unknown =>
  field.reviewerCorrectedValueJson
  ?? field.normalizedValueJson
  ?? field.normalizedValue
  ?? field.rawValueJson
  ?? field.rawValue

const signalValue = (fields: DurableK1FieldValueRecord[], key: string): unknown =>
  effectiveValue(fields.find((field) => field.destinationKind === 'MATCH_SIGNAL' && field.destinationKey === key)!)

const safeSignalValue = (fields: DurableK1FieldValueRecord[], key: string): unknown => {
  const field = fields.find((candidate) => candidate.destinationKind === 'MATCH_SIGNAL' && candidate.destinationKey === key)
  return field ? effectiveValue(field) : null
}

const parseTaxYear = (value: unknown): number | null => {
  const match = /(?:19|20)\d{2}/.exec(String(value ?? ''))
  if (!match) return null
  const year = Number(match[0])
  return year >= 2000 && year <= 2100 ? year : null
}

interface EntityRow { id: string; name: string; tax_id: string | null }
interface PartnershipRow { id: string; entity_id: string; name: string; ein: string | null }

/**
 * Identifier-first matching. Raw TIN/EIN values are used only in memory and
 * parameterized lookup predicates; returned/persisted evidence is masked.
 */
export const buildK1MatchProposal = async (
  client: pg.PoolClient,
  fields: DurableK1FieldValueRecord[],
  authorizedEntityIds?: readonly string[],
): Promise<K1MatchProposal> => {
  const partnerTin = normalizeTaxIdentifier(safeSignalValue(fields, 'partner_tin'))
  const partnershipEin = normalizeTaxIdentifier(safeSignalValue(fields, 'partnership_ein'))
  const partnerName = normalizeRecordName(safeSignalValue(fields, 'partner_name'))
  const partnershipName = normalizeRecordName(safeSignalValue(fields, 'partnership_name'))
  const taxYear = parseTaxYear(safeSignalValue(fields, 'tax_year'))
  const allowed = authorizedEntityIds?.length ? [...authorizedEntityIds] : null

  const entities = partnerTin
    ? await client.query<EntityRow>(
      `select id, name, tax_id from entities
        where regexp_replace(coalesce(tax_id, ''), '[^0-9]', '', 'g') = $1
          and ($2::uuid[] is null or id = any($2::uuid[]))
        order by id`,
      [partnerTin, allowed],
    )
    : { rows: [] as EntityRow[] }
  const partnerships = partnershipEin
    ? await client.query<PartnershipRow>(
      `select id, entity_id, name, ein from partnerships
        where regexp_replace(coalesce(ein, ''), '[^0-9]', '', 'g') = $1
          and ($2::uuid[] is null or entity_id = any($2::uuid[]))
        order by id`,
      [partnershipEin, allowed],
    )
    : { rows: [] as PartnershipRow[] }

  const entityNameRows = partnerName && entities.rows.length === 0
    ? await client.query<EntityRow>(
      `select id, name, tax_id from entities
        where ($1::uuid[] is null or id = any($1::uuid[])) order by name, id`,
      [allowed],
    )
    : { rows: [] as EntityRow[] }
  const partnershipNameRows = partnershipName && partnerships.rows.length === 0
    ? await client.query<PartnershipRow>(
      `select id, entity_id, name, ein from partnerships
        where ($1::uuid[] is null or entity_id = any($1::uuid[])) order by name, id`,
      [allowed],
    )
    : { rows: [] as PartnershipRow[] }

  let entityCandidates = (entities.rows.length > 0
    ? entities.rows.map((row) => ({ row, identifierMatch: true, score: 1 }))
    : entityNameRows.rows
      .map((row) => ({ row, identifierMatch: false, score: nameScore(partnerName, row.name) }))
      .filter(({ score }) => score >= 0.6))
    .map(({ row, identifierMatch, score }): K1MatchCandidateProposal => {
      const contradiction = identifierMatch && partnerName !== null && nameScore(partnerName, row.name) < 0.6
      return {
        type: 'ENTITY', recordId: row.id, recordName: row.name, entityId: row.id,
        score: contradiction ? 0.7 : score,
        maskedLabel: `${row.name}${partnerTin ? ` · ${maskTaxIdentifier(partnerTin, 'ENTITY')}` : ''}`,
        signals: [identifierMatch ? `TIN ending ${partnerTin!.slice(-4)}` : 'normalized name match'],
        identifierMatch, nameContradiction: contradiction,
      }
    })
  const partnershipCandidates = (partnerships.rows.length > 0
    ? partnerships.rows.map((row) => ({ row, identifierMatch: true, score: 1 }))
    : partnershipNameRows.rows
      .map((row) => ({ row, identifierMatch: false, score: nameScore(partnershipName, row.name) }))
      .filter(({ score }) => score >= 0.6))
    .map(({ row, identifierMatch, score }): K1MatchCandidateProposal => {
      const contradiction = identifierMatch && partnershipName !== null && nameScore(partnershipName, row.name) < 0.6
      return {
        type: 'PARTNERSHIP', recordId: row.id, recordName: row.name, entityId: row.entity_id,
        score: contradiction ? 0.7 : score,
        maskedLabel: `${row.name}${partnershipEin ? ` · ${maskTaxIdentifier(partnershipEin, 'PARTNERSHIP')}` : ''}`,
        signals: [identifierMatch ? `EIN ending ${partnershipEin!.slice(-4)}` : 'normalized name match'],
        identifierMatch, nameContradiction: contradiction,
      }
    })

  // In Jackson, a partnership belongs to the entity that receives its K-1.
  // A unique exact EIN match therefore supplies both sides of the destination
  // link when the PDF has no usable partner TIN/name signal. Do not use this
  // fallback when usable partner evidence exists, because a disagreement must
  // remain a reviewable conflict.
  let entityDerivedFromPartnership = false
  if (!partnerTin && !partnerName && entityCandidates.length === 0
    && partnershipCandidates.length === 1 && partnershipCandidates[0]!.identifierMatch) {
    const owner = await client.query<EntityRow>(
      `select id, name, tax_id from entities
        where id = $1 and ($2::uuid[] is null or id = any($2::uuid[]))`,
      [partnershipCandidates[0]!.entityId, allowed],
    )
    if (owner.rows[0]) {
      entityCandidates = [{
        type: 'ENTITY', recordId: owner.rows[0].id, recordName: owner.rows[0].name,
        entityId: owner.rows[0].id, score: 1, maskedLabel: owner.rows[0].name,
        signals: ['owner of the uniquely EIN-matched partnership'],
        identifierMatch: true, nameContradiction: false,
      }]
      entityDerivedFromPartnership = true
    }
  }

  const issueCodes: string[] = []
  if (!partnerTin && !partnerName && !entityDerivedFromPartnership) issueCodes.push('PARTNER_MATCH_SIGNAL_MISSING')
  if (!partnershipEin && !partnershipName) issueCodes.push('PARTNERSHIP_MATCH_SIGNAL_MISSING')
  if (entityCandidates.length === 0) issueCodes.push('ENTITY_MATCH_NOT_FOUND')
  if (partnershipCandidates.length === 0) issueCodes.push('PARTNERSHIP_MATCH_NOT_FOUND')
  if (entityCandidates.length > 1) issueCodes.push('ENTITY_MATCH_AMBIGUOUS')
  if (partnershipCandidates.length > 1) issueCodes.push('PARTNERSHIP_MATCH_AMBIGUOUS')
  if (!taxYear) issueCodes.push('TAX_YEAR_UNRESOLVED')
  if ([...entityCandidates, ...partnershipCandidates].some((candidate) => candidate.nameContradiction)) {
    issueCodes.push('IDENTIFIER_NAME_CONTRADICTION')
  }
  const entity = entityCandidates.length === 1 ? entityCandidates[0] : null
  const partnership = partnershipCandidates.length === 1 ? partnershipCandidates[0] : null
  if (entity && partnership && entity.recordId !== partnership.entityId) {
    issueCodes.push('ENTITY_PARTNERSHIP_CONFLICT')
  }
  const safeToMatch = issueCodes.length === 0 && Boolean(entity && partnership && taxYear)
  return {
    entityId: safeToMatch ? entity!.recordId : null,
    partnershipId: safeToMatch ? partnership!.recordId : null,
    taxYear,
    candidates: [...entityCandidates, ...partnershipCandidates],
    issueCodes: [...new Set(issueCodes)],
    safeToMatch,
  }
}
