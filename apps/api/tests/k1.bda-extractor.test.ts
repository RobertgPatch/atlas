import {
  GetDataAutomationStatusCommand,
  InvokeDataAutomationAsyncCommand,
} from '@aws-sdk/client-bedrock-data-automation-runtime'
import { describe, expect, it, vi } from 'vitest'

import { BdaExtractor } from '../src/modules/k1/extraction/bdaExtractor.js'

const options = (send: ReturnType<typeof vi.fn>) => ({
  client: { send } as never,
  profileArn: 'arn:aws:bedrock:us-west-2:111111111111:data-automation-profile/us.data-automation-v1',
  projectArn: 'arn:aws:bedrock:us-west-2:111111111111:data-automation-project/project',
  projectStage: 'DEVELOPMENT' as const,
  kmsKeyArn: 'arn:aws:kms:us-west-2:111111111111:key/example',
})

describe('BDA extractor', () => {
  it('submits the configured project with the caller deterministic token', async () => {
    const send = vi.fn().mockResolvedValue({ invocationArn: 'arn:aws:bedrock:job/123' })
    const extractor = new BdaExtractor(options(send))
    await expect(extractor.submit({
      clientToken: 'k1-deterministic-token',
      inputS3Uri: 's3://private/originals/document.pdf',
      outputS3Uri: 's3://private/results/attempt/',
      k1DocumentId: '11111111-1111-4111-8111-111111111111',
      extractionAttemptId: '22222222-2222-4222-8222-222222222222',
    })).resolves.toEqual({ providerJobId: 'arn:aws:bedrock:job/123' })

    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(InvokeDataAutomationAsyncCommand)
    expect(command.input).toMatchObject({
      clientToken: 'k1-deterministic-token',
      inputConfiguration: { s3Uri: 's3://private/originals/document.pdf' },
      outputConfiguration: { s3Uri: 's3://private/results/attempt/' },
      dataAutomationConfiguration: { stage: 'DEVELOPMENT' },
      notificationConfiguration: { eventBridgeConfiguration: { eventBridgeEnabled: true } },
    })
    expect(command.input).not.toHaveProperty('blueprints')
  })

  it.each([
    ['InProgress', 'IN_PROGRESS'],
    ['Success', 'SUCCEEDED'],
    ['ServiceError', 'FAILED'],
    ['ClientError', 'FAILED'],
  ] as const)('maps %s status without throwing', async (providerStatus, expected) => {
    const send = vi.fn().mockResolvedValue({
      status: providerStatus,
      outputConfiguration: { s3Uri: 's3://private/results/attempt/result.json' },
      errorType: providerStatus.endsWith('Error') ? 'ProviderFailure' : undefined,
    })
    const extractor = new BdaExtractor(options(send))
    const status = await extractor.getStatus('arn:aws:bedrock:job/123')
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetDataAutomationStatusCommand)
    expect(status.status).toBe(expected)
    expect(status.providerStatus).toBe(providerStatus)
  })
})
