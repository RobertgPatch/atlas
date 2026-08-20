import { randomUUID } from 'node:crypto'

import { withTransaction } from '../../../infra/db/client.js'
import { durableK1BatchRepository, durableK1Repository } from '../k1.repository.js'
import { durableReviewRepository } from '../../review/review.repository.js'
import { k1MatchRepository } from './k1Match.repository.js'
import { buildK1MatchProposal } from './k1Matcher.service.js'
import { transitionK1IngestionItem } from '../ingestion/k1BatchStatus.service.js'
import { isK1StatementReference } from '../extraction/k1DraftValidation.js'

const issueMessage: Record<string, string> = {
  PARTNER_MATCH_SIGNAL_MISSING: 'Partner TIN and name were not extracted.',
  PARTNERSHIP_MATCH_SIGNAL_MISSING: 'Partnership EIN and name were not extracted.',
  ENTITY_MATCH_NOT_FOUND: 'No existing entity matches the extracted partner evidence.',
  PARTNERSHIP_MATCH_NOT_FOUND: 'No existing partnership matches the extracted partnership evidence.',
  ENTITY_MATCH_AMBIGUOUS: 'More than one entity matches the extracted partner evidence.',
  PARTNERSHIP_MATCH_AMBIGUOUS: 'More than one partnership matches the extracted partnership evidence.',
  TAX_YEAR_UNRESOLVED: 'The K-1 tax year could not be resolved.',
  IDENTIFIER_NAME_CONTRADICTION: 'An extracted identifier and name point to conflicting records.',
  ENTITY_PARTNERSHIP_CONFLICT: 'The matched partnership does not belong to the matched entity.',
}

export const k1MatchService = {
  async propose(k1DocumentId: string, authorizedEntityIds?: readonly string[]) {
    const fields = await durableReviewRepository.listForActiveAttempt(k1DocumentId)
    return withTransaction(async (client) => {
      const document = await durableK1Repository.lockById(client, k1DocumentId)
      if (!document?.activeExtractionAttemptId) {
        throw Object.assign(new Error('ACTIVE_EXTRACTION_ATTEMPT_REQUIRED'), { code: 'ACTIVE_EXTRACTION_ATTEMPT_REQUIRED' })
      }
      const proposal = await buildK1MatchProposal(client, fields, authorizedEntityIds)
      await k1MatchRepository.replaceProposals(client, {
        k1DocumentId,
        extractionAttemptId: document.activeExtractionAttemptId,
        candidates: proposal.candidates,
      })
      await client.query(
        `delete from k1_issues where k1_document_id = $1 and extraction_attempt_id = $2
          and issue_code like 'MATCH_%' or (k1_document_id = $1 and extraction_attempt_id = $2
          and issue_code = any($3::text[]))`,
        [k1DocumentId, document.activeExtractionAttemptId, Object.keys(issueMessage)],
      )
      for (const code of proposal.issueCodes) {
        await client.query(
          `insert into k1_issues
             (id, k1_document_id, issue_type, severity, status, message,
              extraction_attempt_id, issue_code, details_json)
           values ($1, $2, 'MATCHING', 'HIGH', 'OPEN', $3, $4, $5, '{}'::jsonb)`,
          [randomUUID(), k1DocumentId, issueMessage[code] ?? 'Matching requires reviewer attention.', document.activeExtractionAttemptId, code],
        )
      }
      const reconciledOccurrences = fields
        .filter((field) => (
          (proposal.safeToMatch && field.destinationKind === 'MATCH_SIGNAL')
          || (field.valueKind === 'CODE_ROW' && isK1StatementReference(field.rawValueJson ?? field.rawValue))
        ))
        .map((field) => field.occurrenceId)
        .filter((occurrenceId): occurrenceId is string => Boolean(occurrenceId))
      if (reconciledOccurrences.length > 0) {
        await client.query(
          `update k1_issues
              set status = 'RESOLVED', resolved_at = now()
            where k1_document_id = $1 and extraction_attempt_id = $2
              and status = 'OPEN' and issue_code = 'INVALID_EXTRACTED_VALUE'
              and occurrence_id = any($3::uuid[])`,
          [k1DocumentId, document.activeExtractionAttemptId, reconciledOccurrences],
        )
      }
      const next = await durableK1Repository.compareAndSet(client, document.id, document.version, {
        matchStatus: proposal.safeToMatch ? 'MATCHED' : 'REQUIRES_REVIEW',
        partnershipId: proposal.safeToMatch ? proposal.partnershipId : document.partnershipId,
        taxYear: proposal.taxYear ?? document.taxYear,
        processingStatus: 'NEEDS_REVIEW',
      })
      if (!next) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
      const item = await client.query<{ id: string; status: string }>(
        'select id, status from k1_ingestion_items where k1_document_id = $1 for update',
        [k1DocumentId],
      )
      if (item.rows[0] && ['QUEUED', 'PROCESSING', 'NEEDS_MATCH', 'NEEDS_REVIEW'].includes(item.rows[0].status)) {
        await durableK1BatchRepository.transitionItem(client, item.rows[0].id, {
          from: ['QUEUED', 'PROCESSING', 'NEEDS_MATCH', 'NEEDS_REVIEW'],
          to: proposal.safeToMatch ? 'NEEDS_REVIEW' : 'NEEDS_MATCH',
        })
      }
      return { document: next, proposal }
    })
  },

  async resolve(args: {
    k1DocumentId: string
    expectedDocumentVersion: number
    entityId: string
    partnershipId: string
    taxYear: number
    actorUserId: string
    authorizedEntityIds: readonly string[]
  }) {
    if (!args.authorizedEntityIds.includes(args.entityId)) {
      throw Object.assign(new Error('FORBIDDEN_ENTITY'), { code: 'FORBIDDEN_ENTITY' })
    }
    return withTransaction(async (client) => {
      const document = await durableK1Repository.lockById(client, args.k1DocumentId)
      if (!document) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
      if (document.version !== args.expectedDocumentVersion) {
        throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION', currentVersion: document.version })
      }
      if (!document.activeExtractionAttemptId) throw Object.assign(new Error('ACTIVE_EXTRACTION_ATTEMPT_REQUIRED'), { code: 'ACTIVE_EXTRACTION_ATTEMPT_REQUIRED' })
      const partnership = await client.query<{ entity_id: string }>(
        'select entity_id from partnerships where id = $1 for share',
        [args.partnershipId],
      )
      if (!partnership.rows[0] || partnership.rows[0].entity_id !== args.entityId) {
        throw Object.assign(new Error('ENTITY_PARTNERSHIP_CONFLICT'), { code: 'ENTITY_PARTNERSHIP_CONFLICT' })
      }
      await k1MatchRepository.select(client, { extractionAttemptId: document.activeExtractionAttemptId, type: 'ENTITY', recordId: args.entityId, actorUserId: args.actorUserId })
      await k1MatchRepository.select(client, { extractionAttemptId: document.activeExtractionAttemptId, type: 'PARTNERSHIP', recordId: args.partnershipId, actorUserId: args.actorUserId })
      const updated = await durableK1Repository.compareAndSet(client, document.id, document.version, {
        matchStatus: 'MATCHED', partnershipId: args.partnershipId, taxYear: args.taxYear,
        processingStatus: 'NEEDS_REVIEW',
      })
      if (!updated) throw Object.assign(new Error('STALE_K1_VERSION'), { code: 'STALE_K1_VERSION' })
      await client.query(
        `update k1_issues set status = 'RESOLVED', resolved_by_user_id = $2, resolved_at = now()
          where k1_document_id = $1 and status = 'OPEN' and issue_type = 'MATCHING'`,
        [args.k1DocumentId, args.actorUserId],
      )
      const item = await client.query<{ id: string }>(
        `select id from k1_ingestion_items where k1_document_id = $1 and status = 'NEEDS_MATCH' for update`,
        [args.k1DocumentId],
      )
      if (item.rows[0]) {
        await transitionK1IngestionItem(client, item.rows[0].id, {
          from: ['NEEDS_MATCH'], to: 'NEEDS_REVIEW',
        })
      }
      return updated
    })
  },
}
