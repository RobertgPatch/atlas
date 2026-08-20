import { randomUUID } from 'node:crypto'
import type pg from 'pg'

import { query } from '../../../infra/db/client.js'
import type { K1MatchCandidateProposal } from './k1Matcher.service.js'

export interface K1MatchCandidateRecord {
  id: string
  extractionAttemptId: string
  type: 'ENTITY' | 'PARTNERSHIP'
  recordId: string
  maskedLabel: string
  score: number
  signals: string[]
  decision: 'PROPOSED' | 'SELECTED' | 'REJECTED'
}

export const k1MatchRepository = {
  async replaceProposals(client: pg.PoolClient, args: {
    k1DocumentId: string
    extractionAttemptId: string
    candidates: K1MatchCandidateProposal[]
  }): Promise<void> {
    await client.query(
      `delete from k1_match_candidates
        where extraction_attempt_id = $1 and decision = 'PROPOSED'`,
      [args.extractionAttemptId],
    )
    for (const candidate of args.candidates) {
      await client.query(
        `insert into k1_match_candidates
           (id, k1_document_id, extraction_attempt_id, candidate_type,
            candidate_record_id, score, signals, decision)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, 'PROPOSED')
         on conflict (extraction_attempt_id, candidate_type, candidate_record_id)
         do update set score = excluded.score, signals = excluded.signals`,
        [
          randomUUID(), args.k1DocumentId, args.extractionAttemptId, candidate.type,
          candidate.recordId, candidate.score,
          JSON.stringify({ maskedLabel: candidate.maskedLabel, signals: candidate.signals }),
        ],
      )
    }
  },

  async listForActiveAttempt(k1DocumentId: string): Promise<K1MatchCandidateRecord[]> {
    const result = await query<{
      id: string; extraction_attempt_id: string; candidate_type: 'ENTITY' | 'PARTNERSHIP'
      candidate_record_id: string; score: string; signals: { maskedLabel?: string; signals?: string[] }
      decision: 'PROPOSED' | 'SELECTED' | 'REJECTED'
    }>(
      `select mc.id, mc.extraction_attempt_id, mc.candidate_type,
              mc.candidate_record_id, mc.score, mc.signals, mc.decision
         from k1_documents kd
         join k1_match_candidates mc on mc.extraction_attempt_id = kd.active_extraction_attempt_id
        where kd.id = $1
        order by mc.candidate_type, mc.score desc, mc.id`,
      [k1DocumentId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      extractionAttemptId: row.extraction_attempt_id,
      type: row.candidate_type,
      recordId: row.candidate_record_id,
      maskedLabel: row.signals.maskedLabel ?? 'Candidate record',
      score: Number(row.score),
      signals: row.signals.signals ?? [],
      decision: row.decision,
    }))
  },

  async select(client: pg.PoolClient, args: {
    extractionAttemptId: string
    type: 'ENTITY' | 'PARTNERSHIP'
    recordId: string
    actorUserId: string
  }): Promise<void> {
    const candidate = await client.query<{ id: string }>(
      `select id from k1_match_candidates
        where extraction_attempt_id = $1 and candidate_type = $2 and candidate_record_id = $3`,
      [args.extractionAttemptId, args.type, args.recordId],
    )
    if (!candidate.rows[0]) {
      await client.query(
        `insert into k1_match_candidates
           (id, k1_document_id, extraction_attempt_id, candidate_type,
            candidate_record_id, score, signals, decision, decided_by_user_id, decided_at)
         select $1, k1_document_id, $2, $3, $4, 0, $5::jsonb, 'SELECTED', $6, now()
           from k1_extraction_attempts where id = $2`,
        [randomUUID(), args.extractionAttemptId, args.type, args.recordId,
          JSON.stringify({ maskedLabel: 'Reviewer-selected record', signals: ['reviewer selection'] }), args.actorUserId],
      )
    }
    await client.query(
      `update k1_match_candidates
          set decision = case when candidate_record_id = $3 then 'SELECTED' else 'REJECTED' end,
              decided_by_user_id = $4,
              decided_at = now()
        where extraction_attempt_id = $1 and candidate_type = $2`,
      [args.extractionAttemptId, args.type, args.recordId, args.actorUserId],
    )
  },
}
