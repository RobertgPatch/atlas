import { describe, expect, it, vi } from 'vitest'
import {
  classifyK1Error,
  k1MetricEnvelope,
  k1WorkflowLogRecord,
  logK1Workflow,
} from '../src/modules/k1/k1Observability.js'

describe('K-1 logging and metrics security', () => {
  it('allows opaque workflow IDs and counters while dropping sensitive and free-text values', () => {
    const record = k1WorkflowLogRecord('k1.extraction.failed', {
      batchId: '11111111-1111-4111-8111-111111111111',
      k1DocumentId: '21111111-1111-4111-8111-111111111111',
      status: 'FAILED', errorCode: 'EXTRACTION_FAILED', retryable: true, pageCount: 12,
      tin: '123-45-6789', ein: '12-3456789', partnerName: 'Private Person',
      fileName: 'private-k1.pdf', message: '1 Main Street', rawValue: '999999',
    } as never)
    const serialized = JSON.stringify(record)
    expect(record).toMatchObject({ status: 'FAILED', errorCode: 'EXTRACTION_FAILED', pageCount: 12 })
    for (const secret of ['123-45-6789', '12-3456789', 'Private Person', 'private-k1.pdf', 'Main Street', '999999']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('emits a stable structured record and classifies actionable errors', () => {
    const logger = { info: vi.fn() }
    logK1Workflow(logger, 'k1.batch.created', { batchId: '11111111-1111-4111-8111-111111111111', count: 25 })
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'k1.batch.created', count: 25 }), 'K-1 workflow event')
    expect(classifyK1Error('BDA_THROTTLED')).toEqual({ errorClass: 'PROVIDER_RETRYABLE', retryable: true })
    expect(classifyK1Error('FORBIDDEN_ENTITY')).toEqual({ errorClass: 'AUTHORIZATION', retryable: false })
  })

  it('builds CloudWatch EMF metrics without document dimensions', () => {
    const metric = k1MetricEnvelope({ metric: 'PagesProcessed', value: 42, unit: 'Count', environment: 'staging', status: 'SUCCEEDED' })
    expect(metric).toMatchObject({ Environment: 'staging', PagesProcessed: 42, Status: 'SUCCEEDED' })
    expect(JSON.stringify(metric)).not.toContain('Document')
  })
})
