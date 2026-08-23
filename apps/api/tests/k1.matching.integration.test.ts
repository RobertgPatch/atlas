import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import type { DurableK1FieldValueRecord } from '../src/modules/review/review.repository.js'
import {
  buildK1MatchProposal,
  maskTaxIdentifier,
  normalizeRecordName,
  normalizeTaxIdentifier,
} from '../src/modules/k1/matching/k1Matcher.service.js'

const durable = pool ? describe : describe.skip

const field = (key: string, value: unknown): DurableK1FieldValueRecord => ({
  id: randomUUID(), k1DocumentId: randomUUID(), extractionAttemptId: randomUUID(),
  canonicalPath: `match.${key}`, occurrenceId: randomUUID(), occurrenceIndex: 0,
  fieldName: `match.${key}`, label: key, section: 'entityMapping', required: false,
  valueKind: 'STRING', rawValue: String(value), rawValueJson: value,
  normalizedValue: String(value), normalizedValueJson: value,
  reviewerCorrectedValue: null, reviewerCorrectedValueJson: null,
  confidenceScore: 0.99, sourceLocations: [], destinationKind: 'MATCH_SIGNAL',
  destinationKey: key, mappingRuleVersion: 'test', reviewStatus: 'PENDING',
  createdAt: new Date(), updatedAt: new Date(),
})

const officialField = (key: string, value: unknown): DurableK1FieldValueRecord => ({
  ...field(key, value),
  canonicalPath: `official.${key}`,
  fieldName: `official.${key}`,
  destinationKind: 'OFFICIAL',
  destinationKey: key,
  section: 'core',
})

durable('K-1 identifier-first matching', () => {
  const entityIds: string[] = []
  const partnershipIds: string[] = []

  beforeEach(async () => {
    entityIds.length = 0
    partnershipIds.length = 0
  })

  afterEach(async () => {
    if (partnershipIds.length) await pool!.query('delete from partnerships where id = any($1::uuid[])', [partnershipIds])
    if (entityIds.length) {
      await pool!.query('delete from entity_memberships where entity_id = any($1::uuid[])', [entityIds])
      await pool!.query('delete from entities where id = any($1::uuid[])', [entityIds])
    }
  })

  const insertEntity = async (name: string, taxId: string) => {
    const id = randomUUID()
    entityIds.push(id)
    await pool!.query(
      `insert into entities (id, name, entity_type, tax_id, status)
       values ($1, $2, 'TRUST', $3, 'ACTIVE')`,
      [id, name, taxId],
    )
    return id
  }

  const insertPartnership = async (entityId: string, name: string, ein: string) => {
    const id = randomUUID()
    partnershipIds.push(id)
    await pool!.query(
      `insert into partnerships (id, entity_id, name, ein, status)
       values ($1, $2, $3, $4, 'ACTIVE')`,
      [id, entityId, name, ein],
    )
    return id
  }

  const propose = async (fields: DurableK1FieldValueRecord[], allowed?: string[]) => {
    const client = await pool!.connect()
    try { return await buildK1MatchProposal(client, fields, allowed) } finally { client.release() }
  }

  it('normalizes identifiers/names and exposes only masked evidence', () => {
    expect(normalizeTaxIdentifier('987-65-4321')).toBe('987654321')
    expect(normalizeTaxIdentifier('invalid')).toBeNull()
    expect(maskTaxIdentifier('987654321', 'ENTITY')).toBe('***-**-4321')
    expect(maskTaxIdentifier('12-3456789', 'PARTNERSHIP')).toBe('**-***6789')
    expect(normalizeRecordName('  Acmé Holdings, LLC ')).toBe('acme holdings')
  })

  it('safely matches unique normalized TIN/EIN, consistent ownership, and tax year', async () => {
    const entityId = await insertEntity('Atlas Family Trust', '987-65-4321')
    const partnershipId = await insertPartnership(entityId, 'Northstar Fund III LP', '12-3456789')
    const proposal = await propose([
      field('partner_tin', '987654321'), field('partner_name', 'Atlas Family Trust'),
      field('partnership_ein', '123456789'), field('partnership_name', 'Northstar Fund III, L.P.'),
      field('tax_year', 'Tax year 2025'),
    ], [entityId])
    expect(proposal).toMatchObject({ safeToMatch: true, entityId, partnershipId, taxYear: 2025, issueCodes: [] })
    expect(JSON.stringify(proposal.candidates)).not.toContain('987654321')
    expect(JSON.stringify(proposal.candidates)).not.toContain('123456789')
    expect(proposal.candidates.map((candidate) => candidate.maskedLabel).join(' ')).toContain('4321')
  })

  it('derives the receiving entity from a unique exact partnership EIN match', async () => {
    const entityId = await insertEntity('Atlas Family Trust', '987-65-4321')
    const partnershipId = await insertPartnership(entityId, 'Iron Triangle Fund LP', '12-3456789')
    const proposal = await propose([
      field('partnership_ein', '123456789'),
      field('partnership_name', 'Iron Triangle Fund LP'),
      field('tax_year', 2025),
    ], [entityId])

    expect(proposal).toMatchObject({
      safeToMatch: true, entityId, partnershipId, taxYear: 2025, issueCodes: [],
    })
    expect(proposal.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ENTITY', recordId: entityId, score: 1 }),
      expect.objectContaining({ type: 'PARTNERSHIP', recordId: partnershipId, score: 1 }),
    ]))
  })

  it('uses the Item H2 disregarded entity name and narrows duplicate partnerships by owner', async () => {
    const gardnerTrust = await insertEntity('Gardner Family Trust', '111-22-0233')
    const descendantTrust = await insertEntity('Gardner Family 2016 Descendants Trust', '222-33-4444')
    const expectedPartnership = await insertPartnership(gardnerTrust, 'AC Bell Investors, LLC', '87-2893106')
    await insertPartnership(descendantTrust, 'AC Bell Investors, LLC', '87-2893106')

    const proposal = await propose([
      field('partner_name', 'Curtis S Gardner'),
      field('partnership_ein', '87-2893106'),
      field('partnership_name', 'AC Bell Investors, LLC'),
      field('tax_year', 2021),
      officialField('part_ii_h2_disregarded_entity', true),
      officialField('part_ii_h2_disregarded_entity_name', 'Gardner Family Trust'),
    ], [gardnerTrust, descendantTrust])

    expect(proposal).toMatchObject({
      safeToMatch: true,
      entityId: gardnerTrust,
      partnershipId: expectedPartnership,
      taxYear: 2021,
      issueCodes: [],
    })
    expect(proposal.candidates.filter((candidate) => candidate.type === 'ENTITY')).toHaveLength(1)
    expect(proposal.candidates.filter((candidate) => candidate.type === 'PARTNERSHIP')).toHaveLength(1)
  })

  it('requires review for duplicate identifiers and never creates background records', async () => {
    const entityA = await insertEntity('One Trust', '111-22-3333')
    const entityB = await insertEntity('Two Trust', '111223333')
    await insertPartnership(entityA, 'Known Fund', '22-3334444')
    const before = await pool!.query<{ count: string }>('select count(*)::text as count from entities')
    const proposal = await propose([
      field('partner_tin', '111223333'), field('partnership_ein', '223334444'), field('tax_year', 2024),
    ], [entityA, entityB])
    const after = await pool!.query<{ count: string }>('select count(*)::text as count from entities')
    expect(proposal.safeToMatch).toBe(false)
    expect(proposal.issueCodes).toContain('ENTITY_MATCH_AMBIGUOUS')
    expect(after.rows[0].count).toBe(before.rows[0].count)
  })

  it('flags identifier/name contradictions, entity-partnership conflicts, and unresolved year', async () => {
    const entityA = await insertEntity('Correct Partner', '222-33-4444')
    const entityB = await insertEntity('Other Partner', '333-44-5555')
    await insertPartnership(entityB, 'Real Fund', '44-5556666')
    const proposal = await propose([
      field('partner_tin', '222334444'), field('partner_name', 'Completely Different Name'),
      field('partnership_ein', '445556666'), field('partnership_name', 'Real Fund'),
    ], [entityA, entityB])
    expect(proposal.safeToMatch).toBe(false)
    expect(proposal.issueCodes).toEqual(expect.arrayContaining([
      'IDENTIFIER_NAME_CONTRADICTION', 'ENTITY_PARTNERSHIP_CONFLICT', 'TAX_YEAR_UNRESOLVED',
    ]))
  })

  it('rechecks the current authorization scope before proposing records', async () => {
    const allowed = await insertEntity('Allowed Trust', '444-55-6666')
    const revoked = await insertEntity('Revoked Trust', '555-66-7777')
    await insertPartnership(revoked, 'Revoked Fund', '66-7778888')
    const proposal = await propose([
      field('partner_tin', '555667777'), field('partnership_ein', '667778888'), field('tax_year', 2025),
    ], [allowed])
    expect(proposal.safeToMatch).toBe(false)
    expect(proposal.candidates).toHaveLength(0)
    expect(proposal.issueCodes).toEqual(expect.arrayContaining(['ENTITY_MATCH_NOT_FOUND', 'PARTNERSHIP_MATCH_NOT_FOUND']))
  })
})
