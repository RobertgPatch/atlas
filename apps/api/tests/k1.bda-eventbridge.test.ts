import { describe, expect, it } from 'vitest'

import { parseBdaEventBridgeCompletion } from '../src/modules/k1/queue/sqsK1WorkQueue.js'

describe('BDA EventBridge completion adapter', () => {
  it.each([
    ['Bedrock Data Automation Job Succeeded', 'Success'],
    ['Bedrock Data Automation Job Failed With Client Error', 'ClientError'],
    ['Bedrock Data Automation Job Failed With Service Error', 'ServiceError'],
  ])('converts %s into the internal durable message', async (detailType, providerStatus) => {
    const event = {
      id: 'event-1', source: 'aws.bedrock', time: '2025-05-27T22:48:36Z',
      'detail-type': detailType,
      detail: {
        job_id: 'job-123', job_status: 'SUCCESS',
        output_s3_location: { s3_bucket: 'private-bucket', name: 'extraction-results/attempt/result.json' },
      },
    }
    const message = await parseBdaEventBridgeCompletion(event, async () => ({
      id: '22222222-2222-4222-8222-222222222222',
      k1DocumentId: '11111111-1111-4111-8111-111111111111',
      providerJobId: 'arn:aws:bedrock:us-west-2::data-automation-invocation/job-123',
    }) as never)
    expect(message).toMatchObject({
      type: 'K1_EXTRACTION_COMPLETION',
      providerStatus,
      k1DocumentId: '11111111-1111-4111-8111-111111111111',
      extractionAttemptId: '22222222-2222-4222-8222-222222222222',
      output: { bucket: 'private-bucket', key: 'extraction-results/attempt/result.json' },
    })
  })

  it('resolves the live numeric asset directory to the job manifest', async () => {
    const message = await parseBdaEventBridgeCompletion({
      id: 'event-live', source: 'aws.bedrock', time: '2026-08-18T10:35:00Z',
      'detail-type': 'Bedrock Data Automation Job Succeeded',
      detail: {
        job_id: 'job-456', job_status: 'SUCCESS',
        output_s3_location: {
          s3_bucket: 'private-bucket',
          name: 'extraction-results/attempt/job-456/0',
        },
      },
    }, async () => ({
      id: '22222222-2222-4222-8222-222222222222',
      k1DocumentId: '11111111-1111-4111-8111-111111111111',
      providerJobId: 'arn:aws:bedrock:us-west-2::data-automation-invocation/job-456',
    }) as never)

    expect(message.output).toEqual({
      bucket: 'private-bucket',
      key: 'extraction-results/attempt/job-456/job_metadata.json',
      versionId: null,
    })
  })
})
