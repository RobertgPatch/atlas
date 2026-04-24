import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pino } from 'pino'
import { config } from '../../../config.js'
import { mapAzureAnalyzeResult, type AnalyzeResult } from './mapAzureAnalyzeResult.js'
import {
  mapAzureCustomAnalyzeResult,
  type CustomAnalyzeResult,
} from './mapAzureCustomAnalyzeResult.js'
import {
  mapAzureOcrAnalyzeResult,
  type OcrAnalyzeResult,
} from './mapAzureOcrAnalyzeResult.js'
import type { K1Extractor, ExtractCtx, ExtractResult } from './K1Extractor.js'

// ---------------------------------------------------------------------------
// PII-safe child logger
// Redacts all value-bearing fields from Azure DI output before any log line.
// ---------------------------------------------------------------------------
const log = pino({
  name: 'k1.azure-extractor',
  redact: {
    paths: [
      '*.valueString',
      '*.valueNumber',
      '*.valueCurrency',
      '*.content',
      '*.valueDate',
      '*.valueObject',
      '*.valueArray',
    ],
    remove: true,
  },
})

// ---------------------------------------------------------------------------
// Error code mapping helpers
// ---------------------------------------------------------------------------

type AzureErrorCode =
  | 'PARSE_NETWORK'
  | 'PARSE_AUTH'
  | 'PARSE_TIMEOUT'
  | 'PARSE_MODEL_ERROR'
  | 'PARSE_SCHEMA_MISMATCH'

type AzureAnalyzeResult = AnalyzeResult & OcrAnalyzeResult & CustomAnalyzeResult

function classifyHttpError(httpStatus: number): AzureErrorCode {
  if (httpStatus === 401 || httpStatus === 403) return 'PARSE_AUTH'
  if (httpStatus === 400 || httpStatus === 404) return 'PARSE_MODEL_ERROR'
  if (httpStatus === 408) return 'PARSE_TIMEOUT'
  if (httpStatus === 429 || httpStatus >= 500) return 'PARSE_NETWORK'
  return 'PARSE_MODEL_ERROR'
}

function classifyException(err: unknown): AzureErrorCode {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'PARSE_TIMEOUT'
    const msg = err.message.toLowerCase()
    if (
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('fetch failed') ||
      msg.includes('network')
    ) {
      return 'PARSE_NETWORK'
    }
  }
  return 'PARSE_NETWORK'
}

// ---------------------------------------------------------------------------
// Retry helper — one retry on transient network errors (500 ms back-off)
// ---------------------------------------------------------------------------

const RETRY_DELAY_MS = 500

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const code = classifyException(err)
    if (code !== 'PARSE_NETWORK') throw err
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    return fn()
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAzureExtractor(): K1Extractor {
  const { endpoint, key, apiVersion, modelId } = config.azureDocumentIntelligence

  let _client: ReturnType<typeof DocumentIntelligence> | null = null
  const getClient = () => {
    if (!_client) {
      if (!endpoint || !key) {
        throw new Error(
          'Azure Document Intelligence is not configured. ' +
            'Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY.',
        )
      }
      _client = DocumentIntelligence(endpoint, { key })
    }
    return _client
  }

  return {
    backend: 'azure',

    async extract(ctx: ExtractCtx): Promise<ExtractResult> {
      const startMs = Date.now()

      // --- Read PDF from local storage ---
      let pdfBuffer: Uint8Array
      try {
        const buf = await readFile(path.resolve(config.storageRoot, ctx.storagePath))
        pdfBuffer = new Uint8Array(buf)
      } catch (err) {
        return {
          outcome: 'FAILURE',
          errorCode: 'PARSE_NETWORK',
          errorMessage: `Failed to read PDF from storage: ${(err as Error).message}`,
        }
      }

      // --- Submit analysis to Azure DI ---
      let analyzeResult: AzureAnalyzeResult

      try {
        analyzeResult = await withRetry(async () => {
          const client = getClient()

          const initialResponse = await client
            .path('/documentModels/{modelId}:analyze', modelId)
            .post({
              contentType: 'application/pdf',
              body: pdfBuffer,
              queryParameters: {
                'api-version': apiVersion,
                stringIndexType: 'utf16CodeUnit',
              } as Record<string, string>,
            })

          if (isUnexpected(initialResponse)) {
            const httpStatus = initialResponse.status as unknown as number
            const code = classifyHttpError(httpStatus)
            throw Object.assign(
              new Error(
                `Azure DI returned HTTP ${httpStatus}: ${
                  (initialResponse.body as { message?: string }).message ?? 'unknown error'
                }`,
              ),
              { _azureCode: code },
            )
          }

          const opLocation =
            (initialResponse.headers as Record<string, string>)['operation-location'] ?? ''
          const operationId = opLocation.split('/').pop()?.split('?')[0] ?? 'unknown'

          log.info(
            {
              k1DocumentId: ctx.k1DocumentId,
              modelId,
              operationId,
              httpStatus: initialResponse.status,
              pdfSizeBytes: ctx.pdfSizeBytes,
            },
            'k1.azure.submitted',
          )

          const poller = getLongRunningPoller(client, initialResponse, {
            intervalInMs: 1_000,
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pollResult = await (poller as any).pollUntilDone({
            abortSignal: AbortSignal.timeout(60_000),
          })

          if (isUnexpected(pollResult)) {
            const httpStatus = pollResult.status as unknown as number
            const code = classifyHttpError(httpStatus)
            throw Object.assign(
              new Error(
                `Azure DI poll returned HTTP ${httpStatus}: ${
                  (pollResult.body as { message?: string }).message ?? 'unknown error'
                }`,
              ),
              { _azureCode: code },
            )
          }

          const analyzeBody = pollResult.body as {
            status?: string
            analyzeResult?: AnalyzeResult
          }
          if (analyzeBody.status === 'failed') {
            throw Object.assign(new Error('Azure DI analysis failed'), {
              _azureCode: 'PARSE_MODEL_ERROR' as AzureErrorCode,
            })
          }

          if (!analyzeBody.analyzeResult) {
            throw Object.assign(new Error('Azure DI returned no analyzeResult payload.'), {
              _azureCode: 'PARSE_SCHEMA_MISMATCH' as AzureErrorCode,
            })
          }

          return analyzeBody.analyzeResult as AzureAnalyzeResult
        })
      } catch (err) {
        const errorWithCode = err as Error & { _azureCode?: AzureErrorCode }
        const errorCode: AzureErrorCode = errorWithCode._azureCode ?? classifyException(err)
        log.error(
          { k1DocumentId: ctx.k1DocumentId, errorCode, durationMs: Date.now() - startMs },
          'k1.azure.failed',
        )
        return {
          outcome: 'FAILURE',
          errorCode,
          errorMessage: (err as Error).message,
        }
      }

      // --- Map Azure result to ExtractResult ---
      const docType = analyzeResult.documents?.[0]?.docType ?? ''
      let mapped =
        modelId !== 'prebuilt-layout' && docType.startsWith(`${modelId}:`)
          ? mapAzureCustomAnalyzeResult(analyzeResult, { k1DocumentId: ctx.k1DocumentId })
          : mapAzureAnalyzeResult(analyzeResult, { k1DocumentId: ctx.k1DocumentId })

      if (mapped.outcome === 'FAILURE') {
        mapped = mapAzureAnalyzeResult(analyzeResult, { k1DocumentId: ctx.k1DocumentId })
      }

      if (mapped.outcome === 'FAILURE' && analyzeResult.content) {
        log.warn({ k1DocumentId: ctx.k1DocumentId }, 'k1.azure.fallback_to_ocr')
        mapped = mapAzureOcrAnalyzeResult(analyzeResult, { k1DocumentId: ctx.k1DocumentId })
      }

      const durationMs = Date.now() - startMs

      if (mapped.outcome === 'SUCCESS') {
        const fieldValues = mapped.fieldValues
        const confidenceScores = fieldValues
          .map((fv) => fv.confidenceScore)
          .filter((s) => s > 0)
        const avgConfidence =
          confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0
        const minConfidence = confidenceScores.length > 0 ? Math.min(...confidenceScores) : 0
        const requiredTotal = fieldValues.filter((fv) => fv.required).length
        const requiredPresent = fieldValues.filter(
          (fv) => fv.required && fv.rawValue !== null,
        ).length
        const requiredCoverage =
          requiredTotal > 0 ? (requiredPresent / requiredTotal).toFixed(3) : '1.000'

        log.info(
          {
            k1DocumentId: ctx.k1DocumentId,
            durationMs,
            pdfSizeBytes: ctx.pdfSizeBytes,
            fieldCount: fieldValues.length,
            requiredCoverage,
            avgConfidence: Number(avgConfidence.toFixed(3)),
            minConfidence: Number(minConfidence.toFixed(3)),
            issueCount: mapped.issues.length,
            nextStatus: mapped.nextStatus,
          },
          'k1.azure.completed',
        )
      }

      return mapped
    },
  }
}
