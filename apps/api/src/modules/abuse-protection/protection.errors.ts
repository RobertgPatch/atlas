import { randomUUID } from 'node:crypto'

import type { AdmissionRejectionCode } from './protection.types.js'

export const MAX_PROTECTION_ERROR_BODY_BYTES = 1_024
export const MAX_RETRY_AFTER_SECONDS = 86_400

export type RateLimitErrorCode = Extract<
  AdmissionRejectionCode,
  'RATE_LIMITED' | 'QUOTA_EXCEEDED'
>

export type ProtectionUnavailableErrorCode = Extract<
  AdmissionRejectionCode,
  'WORKLOAD_DISABLED' | 'PROTECTION_UNAVAILABLE'
>

export interface ProtectionErrorBody {
  readonly error: AdmissionRejectionCode
  readonly message: string
  readonly requestId: string
  readonly retryAfterSeconds: number
}

export interface ProtectionErrorResponse {
  readonly statusCode: 429 | 503
  readonly headers: Readonly<{
    'Retry-After': string
    'X-Request-Id': string
  }>
  readonly body: ProtectionErrorBody
}

export interface ProtectionErrorInput<TCode extends AdmissionRejectionCode> {
  readonly code: TCode
  readonly requestId?: string
  readonly retryAfterSeconds: number
}

const messages: Readonly<Record<AdmissionRejectionCode, string>> = {
  RATE_LIMITED: 'Request limit reached. Retry later.',
  QUOTA_EXCEEDED: 'Workload quota reached. Retry later.',
  WORKLOAD_DISABLED: 'This workload is temporarily unavailable.',
  PROTECTION_UNAVAILABLE: 'Protection service is temporarily unavailable.',
}

const boundedRetryAfter = (value: number): number => {
  if (!Number.isFinite(value)) return MAX_RETRY_AFTER_SECONDS
  return Math.max(1, Math.min(MAX_RETRY_AFTER_SECONDS, Math.ceil(value)))
}

const boundedRequestId = (value: string | undefined): string => {
  const candidate = value?.trim()
  return candidate && candidate.length >= 8 && candidate.length <= 128
    ? candidate
    : `req_${randomUUID()}`
}

const buildResponse = (
  statusCode: 429 | 503,
  input: ProtectionErrorInput<AdmissionRejectionCode>,
): ProtectionErrorResponse => {
  const retryAfterSeconds = boundedRetryAfter(input.retryAfterSeconds)
  const requestId = boundedRequestId(input.requestId)
  const body: ProtectionErrorBody = {
    error: input.code,
    message: messages[input.code],
    requestId,
    retryAfterSeconds,
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_PROTECTION_ERROR_BODY_BYTES) {
    throw new Error('PROTECTION_ERROR_BODY_TOO_LARGE')
  }
  return {
    statusCode,
    headers: {
      'Retry-After': String(retryAfterSeconds),
      'X-Request-Id': requestId,
    },
    body,
  }
}

export const buildRateLimitedResponse = (
  input: ProtectionErrorInput<RateLimitErrorCode>,
): ProtectionErrorResponse => buildResponse(429, input)

export const buildProtectionUnavailableResponse = (
  input: ProtectionErrorInput<ProtectionUnavailableErrorCode>,
): ProtectionErrorResponse => buildResponse(503, input)
