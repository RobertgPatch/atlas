import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'

import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import { classifyK1Document } from '../extraction/k1DocumentClassification.js'
import {
  applyK1StatusCheckboxVerification,
  BedrockK1StatusCheckboxVerifier,
  hasAmbiguousK1StatusCheckbox,
  type K1StatusCheckboxVerifier,
} from '../extraction/bedrockCheckboxVerifier.js'
import { k1ExtractionAttemptRepository } from '../extraction/k1ExtractionAttempt.repository.js'
import { mapBdaResult } from '../extraction/mapBdaResult.js'
import { durableK1BatchRepository, durableK1Repository } from '../k1.repository.js'
import { k1MatchService } from '../matching/k1Match.service.js'
import type { K1ExtractionDraft } from '../k1.types.js'
import type { K1CompletionMessage, K1ReceivedMessage } from '../queue/K1WorkQueue.js'
import { readObjectToBuffer, type K1ObjectIdentity, type K1ObjectStore } from '../storage/K1ObjectStore.js'

export interface K1CompletionHandlerDependencies {
  objectStore: K1ObjectStore
  maxRawResultBytes?: number
  checkboxVerifier?: K1StatusCheckboxVerifier
}

const readRawResult = async (
  objectStore: K1ObjectStore,
  identity: K1ObjectIdentity,
  maximum: number,
): Promise<{ bytes: Buffer; sha256: string }> => {
  const object = await objectStore.readRawResult(identity)
  if (object.metadata.sizeBytes > maximum) throw Object.assign(new Error('BDA_RAW_RESULT_TOO_LARGE'), { code: 'BDA_RAW_RESULT_TOO_LARGE' })
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of object.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.byteLength
    if (total > maximum) {
      object.body.destroy()
      throw Object.assign(new Error('BDA_RAW_RESULT_TOO_LARGE'), { code: 'BDA_RAW_RESULT_TOO_LARGE' })
    }
    chunks.push(buffer)
  }
  const bytes = Buffer.concat(chunks, total)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (object.metadata.checksumSha256 && object.metadata.checksumSha256.toLowerCase() !== sha256) {
    throw Object.assign(new Error('RAW_RESULT_CHECKSUM_MISMATCH'), { code: 'RAW_RESULT_CHECKSUM_MISMATCH' })
  }
  return { bytes, sha256 }
}

const parseJson = (bytes: Buffer, code: string): unknown => {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw Object.assign(new Error(code), { code })
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const parseManifestS3Uri = (
  value: unknown,
  manifest: K1ObjectIdentity,
): K1ObjectIdentity => {
  if (typeof value !== 'string') {
    throw Object.assign(new Error('BDA_RESULT_PATH_MISSING'), { code: 'BDA_RESULT_PATH_MISSING' })
  }
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(value)
  if (!match) throw Object.assign(new Error('BDA_RESULT_PATH_INVALID'), { code: 'BDA_RESULT_PATH_INVALID' })
  const bucket = manifest.bucket
  const manifestPrefix = manifest.key.slice(0, manifest.key.lastIndexOf('/') + 1)
  if (!bucket || match[1] !== bucket || !match[2].startsWith(manifestPrefix)) {
    throw Object.assign(new Error('BDA_RESULT_PATH_OUTSIDE_JOB'), { code: 'BDA_RESULT_PATH_OUTSIDE_JOB' })
  }
  return { bucket, key: match[2], versionId: null }
}

interface LoadedBdaProviderResult {
  providerResult: unknown
  integritySha256: string
}

/**
 * BDA completion events point at job_metadata.json. The actual custom and
 * standard outputs live in separate S3 objects referenced by that manifest.
 * Load and combine them into the provider-neutral shape consumed by the mapper.
 */
export const loadBdaProviderResult = async (
  objectStore: K1ObjectStore,
  manifestIdentity: K1ObjectIdentity,
  maximum: number,
): Promise<LoadedBdaProviderResult> => {
  const manifest = await readRawResult(objectStore, manifestIdentity, maximum)
  const manifestJson = parseJson(manifest.bytes, 'BDA_RAW_RESULT_INVALID_JSON')
  const root = asRecord(manifestJson)
  const outputMetadata = asArray(root?.output_metadata)

  // Preserve compatibility with consolidated fixtures and non-BDA test
  // extractors, which already return outputSegments directly.
  if (outputMetadata.length === 0) {
    return { providerResult: manifestJson, integritySha256: manifest.sha256 }
  }

  const segmentMetadata = outputMetadata.flatMap((rawAsset) => {
    const asset = asRecord(rawAsset)
    return asArray(asset?.segment_metadata).flatMap((rawSegment) => {
      const segment = asRecord(rawSegment)
      return segment ? [segment] : []
    })
  })
  if (segmentMetadata.length === 0) {
    throw Object.assign(new Error('BDA_RESULT_SEGMENTS_MISSING'), { code: 'BDA_RESULT_SEGMENTS_MISSING' })
  }

  let totalBytes = manifest.bytes.byteLength
  const integrity = createHash('sha256').update(`manifest:${manifest.sha256}\n`)
  const outputSegments: Array<Record<string, unknown>> = []
  for (const [index, segment] of segmentMetadata.entries()) {
    const standardIdentity = parseManifestS3Uri(segment.standard_output_path, manifestIdentity)
    const customIdentity = parseManifestS3Uri(segment.custom_output_path, manifestIdentity)
    const remaining = maximum - totalBytes
    if (remaining <= 0) throw Object.assign(new Error('BDA_RAW_RESULT_TOO_LARGE'), { code: 'BDA_RAW_RESULT_TOO_LARGE' })
    const standard = await readRawResult(objectStore, standardIdentity, remaining)
    totalBytes += standard.bytes.byteLength
    const customRemaining = maximum - totalBytes
    if (customRemaining <= 0) throw Object.assign(new Error('BDA_RAW_RESULT_TOO_LARGE'), { code: 'BDA_RAW_RESULT_TOO_LARGE' })
    const custom = await readRawResult(objectStore, customIdentity, customRemaining)
    totalBytes += custom.bytes.byteLength
    integrity.update(`segment:${index}:standard:${standardIdentity.key}:${standard.sha256}\n`)
    integrity.update(`segment:${index}:custom:${customIdentity.key}:${custom.sha256}\n`)
    outputSegments.push({
      customOutputStatus: typeof segment.custom_output_status === 'string'
        ? segment.custom_output_status
        : 'UNKNOWN',
      standardOutput: parseJson(standard.bytes, 'BDA_STANDARD_OUTPUT_INVALID_JSON'),
      customOutput: parseJson(custom.bytes, 'BDA_CUSTOM_OUTPUT_INVALID_JSON'),
    })
  }

  return {
    providerResult: { outputSegments },
    integritySha256: integrity.digest('hex'),
  }
}

const jsonText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const insertDraft = async (
  client: pg.PoolClient,
  k1DocumentId: string,
  attemptId: string,
  provider: string,
  draft: K1ExtractionDraft,
  issues: K1ExtractionDraft['validationIssues'],
): Promise<void> => {
  for (const [index, value] of draft.values.entries()) {
    const firstLocation = value.sourceLocations[0]
    await client.query(
      `insert into k1_field_values
         (id, k1_document_id, field_name, raw_value, normalized_value,
          confidence_score, extraction_method, review_status, page_number, source_ref,
          extraction_attempt_id, canonical_path, occurrence_id, occurrence_index,
          label, review_section, is_required, value_kind, raw_value_json,
          normalized_value_json, source_locations, destination_kind, destination_key,
          mapping_rule_version)
       values
         ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9,
          $10, $11, $12, $13, $14, $15, false, $16, $17::jsonb,
          $18::jsonb, $19::jsonb, $20, $21, $22)
       on conflict (extraction_attempt_id, occurrence_id) where extraction_attempt_id is not null and occurrence_id is not null
       do nothing`,
      [
        randomUUID(), k1DocumentId, value.canonicalPath, jsonText(value.rawValue),
        jsonText(value.normalizedValue), value.confidence, provider, firstLocation?.page ?? null,
        firstLocation?.textRef ?? null, attemptId, value.canonicalPath, value.occurrenceId,
        index, value.canonicalPath,
        value.destination?.kind === 'MATCH_SIGNAL'
          ? (value.destination.key === 'partnership_ein' || value.destination.key === 'partnership_name' ? 'partnershipMapping' : 'entityMapping')
          : 'core',
        value.kind, JSON.stringify(value.rawValue ?? null), JSON.stringify(value.normalizedValue ?? null),
        JSON.stringify(value.sourceLocations), value.destination?.kind ?? 'EVIDENCE_ONLY',
        value.destination?.key ?? null, value.mappingRuleVersion,
      ],
    )
  }
  for (const draftIssue of issues) {
    await client.query(
      `insert into k1_issues
         (id, k1_document_id, issue_type, severity, status, message,
          extraction_attempt_id, occurrence_id, issue_code, details_json)
       values ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9::jsonb)`,
      [
        randomUUID(), k1DocumentId, draftIssue.code, draftIssue.severity,
        draftIssue.message, attemptId, draftIssue.occurrenceId ?? null,
        draftIssue.code, JSON.stringify(draftIssue.details ?? {}),
      ],
    )
  }
}

const terminalProviderFailure = (status: string): boolean =>
  ['ServiceError', 'ClientError', 'FAILED', 'FAILURE'].includes(status)

export const createK1CompletionHandler = (dependencies: K1CompletionHandlerDependencies) =>
  async (received: K1ReceivedMessage<K1CompletionMessage>, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) throw Object.assign(new Error('K1_WORKER_ABORTED'), { code: 'K1_WORKER_ABORTED' })
    const message = received.message
    const attempt = await k1ExtractionAttemptRepository.getById(message.extractionAttemptId)
    if (!attempt || attempt.k1DocumentId !== message.k1DocumentId || attempt.providerJobId !== message.providerJobId) {
      throw Object.assign(new Error('EXTRACTION_COMPLETION_IDENTITY_MISMATCH'), { code: 'EXTRACTION_COMPLETION_IDENTITY_MISMATCH' })
    }
    if (attempt.status === 'SUCCEEDED') {
      const completedDocument = await durableK1Repository.getById(message.k1DocumentId)
      if (completedDocument?.matchStatus === 'UNRESOLVED') {
        await k1MatchService.propose(message.k1DocumentId)
      }
      return
    }
    if (terminalProviderFailure(message.providerStatus)) {
      await k1ExtractionAttemptRepository.markFailed({
        attemptId: attempt.id,
        errorCode: `BDA_${message.providerStatus.toUpperCase()}`,
        errorSummary: 'Bedrock Data Automation reported a terminal extraction failure.',
      })
      await withTransaction(async (client) => {
        const item = await client.query<{ id: string; status: string }>(
          `select id, status from k1_ingestion_items where k1_document_id = $1 for update`,
          [message.k1DocumentId],
        )
        if (item.rows[0] && ['QUEUED', 'PROCESSING'].includes(item.rows[0].status)) {
          await durableK1BatchRepository.transitionItem(client, item.rows[0].id, {
            from: ['QUEUED', 'PROCESSING'],
            to: 'FAILED',
            errorCode: 'EXTRACTION_FAILED',
            errorSummary: 'The extraction provider could not process this document.',
          })
        }
      })
      return
    }
    if (!message.output) throw Object.assign(new Error('BDA_COMPLETION_OUTPUT_MISSING'), { code: 'BDA_COMPLETION_OUTPUT_MISSING' })

    const raw = await loadBdaProviderResult(
      dependencies.objectStore,
      message.output,
      dependencies.maxRawResultBytes ?? 50 * 1024 * 1024,
    )
    let draft = mapBdaResult(raw.providerResult)
    const document = await durableK1Repository.getById(message.k1DocumentId)
    if (!document) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
    if (hasAmbiguousK1StatusCheckbox(draft)) {
      try {
        const pdfBytes = await readObjectToBuffer(dependencies.objectStore, {
          key: document.storagePath,
          bucket: document.storageBucket,
          versionId: document.storageVersionId,
        }, config.k1Ingestion.bedrockReview.maxDocumentBytes)
        const verifier = dependencies.checkboxVerifier ?? new BedrockK1StatusCheckboxVerifier({
          modelId: config.k1Ingestion.bedrockReview.modelId,
          region: config.aws.region,
        })
        const verification = await verifier.verify(pdfBytes)
        draft = applyK1StatusCheckboxVerification(draft, verification)
      } catch {
        // Fail safe: retain the field-specific AMBIGUOUS_CHECKBOX issue so a
        // reviewer must verify the status against the PDF.
      }
    }
    const classification = classifyK1Document({ draft, pageCount: document.pageCount })
    const nextDocumentStatus = classification.issues.length === 0 ? 'READY_FOR_APPROVAL' : 'NEEDS_REVIEW'

    await withTransaction(async (client) => {
      const lockedAttempt = await k1ExtractionAttemptRepository.getById(attempt.id, client, true)
      if (!lockedAttempt) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
      if (lockedAttempt.status === 'SUCCEEDED') {
        if (lockedAttempt.rawResultSha256 !== raw.integritySha256) throw Object.assign(new Error('RAW_RESULT_INTEGRITY_CONFLICT'), { code: 'RAW_RESULT_INTEGRITY_CONFLICT' })
        return
      }
      await insertDraft(client, message.k1DocumentId, attempt.id, attempt.provider, draft, classification.issues)
      await k1ExtractionAttemptRepository.promoteSucceeded(client, {
        attemptId: attempt.id,
        rawResultKey: message.output!.key,
        rawResultSha256: raw.integritySha256,
        customOutputStatus: draft.form.customOutputStatus,
        nextDocumentStatus,
      })
    })
    await k1MatchService.propose(message.k1DocumentId)
  }
