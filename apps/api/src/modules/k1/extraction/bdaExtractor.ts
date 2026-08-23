import {
  BedrockDataAutomationRuntimeClient,
  GetDataAutomationStatusCommand,
  InvokeDataAutomationAsyncCommand,
  type AutomationJobStatus,
} from '@aws-sdk/client-bedrock-data-automation-runtime'

import { config } from '../../../config.js'
import type {
  ExtractCtx,
  ExtractResult,
  K1AsyncExtractor,
  K1AsyncJobStatus,
  K1AsyncSubmission,
  K1AsyncSubmissionInput,
} from './K1Extractor.js'

type BdaClient = Pick<BedrockDataAutomationRuntimeClient, 'send'>

export interface BdaExtractorOptions {
  client?: BdaClient
  region?: string
  profileArn?: string
  projectArn?: string
  projectStage?: 'DEVELOPMENT' | 'LIVE'
  kmsKeyArn?: string
}

const requireSetting = (value: string, code: string): string => {
  if (!value) throw Object.assign(new Error(code), { code })
  return value
}

const mapStatus = (providerStatus: AutomationJobStatus | undefined): K1AsyncJobStatus['status'] => {
  if (providerStatus === 'Success') return 'SUCCEEDED'
  if (providerStatus === 'ServiceError' || providerStatus === 'ClientError') return 'FAILED'
  return 'IN_PROGRESS'
}

export class BdaExtractor implements K1AsyncExtractor {
  readonly backend = 'aws_bda' as const
  private readonly client: BdaClient
  private readonly profileArn: string
  private readonly projectArn: string
  private readonly projectStage: 'DEVELOPMENT' | 'LIVE'
  private readonly kmsKeyArn: string

  constructor(options: BdaExtractorOptions = {}) {
    this.client = options.client ?? new BedrockDataAutomationRuntimeClient({
      region: options.region ?? config.aws.region,
      maxAttempts: 5,
    })
    this.profileArn = requireSetting(options.profileArn ?? config.k1Ingestion.bda.profileArn, 'K1_BDA_PROFILE_ARN_REQUIRED')
    this.projectArn = requireSetting(options.projectArn ?? config.k1Ingestion.bda.projectArn, 'K1_BDA_PROJECT_ARN_REQUIRED')
    this.projectStage = options.projectStage ?? config.k1Ingestion.bda.projectStage
    this.kmsKeyArn = requireSetting(options.kmsKeyArn ?? config.k1Ingestion.s3.kmsKeyArn, 'K1_S3_KMS_KEY_REQUIRED')
  }

  async extract(_ctx: ExtractCtx): Promise<ExtractResult> {
    return {
      outcome: 'FAILURE',
      errorCode: 'AWS_BDA_ASYNC_WORKER_REQUIRED',
      errorMessage: 'AWS BDA extraction must be invoked through the durable extraction worker.',
    }
  }

  async submit(input: K1AsyncSubmissionInput): Promise<K1AsyncSubmission> {
    const response = await this.client.send(new InvokeDataAutomationAsyncCommand({
      clientToken: input.clientToken,
      inputConfiguration: { s3Uri: input.inputS3Uri },
      outputConfiguration: { s3Uri: input.outputS3Uri },
      dataAutomationConfiguration: {
        dataAutomationProjectArn: this.projectArn,
        stage: this.projectStage,
      },
      dataAutomationProfileArn: this.profileArn,
      encryptionConfiguration: {
        kmsKeyId: this.kmsKeyArn,
        kmsEncryptionContext: {
          'atlas:k1-document-id': input.k1DocumentId,
          'atlas:extraction-attempt-id': input.extractionAttemptId,
        },
      },
      notificationConfiguration: {
        eventBridgeConfiguration: { eventBridgeEnabled: true },
      },
      tags: [
        { key: 'atlas-workload', value: 'k1-ingestion' },
        { key: 'atlas-attempt-id', value: input.extractionAttemptId },
      ],
    })) as { invocationArn?: string }
    if (!response.invocationArn) throw Object.assign(new Error('BDA_INVOCATION_ARN_MISSING'), { code: 'BDA_INVOCATION_ARN_MISSING' })
    return { providerJobId: response.invocationArn }
  }

  async getStatus(providerJobId: string): Promise<K1AsyncJobStatus> {
    const response = await this.client.send(new GetDataAutomationStatusCommand({ invocationArn: providerJobId })) as {
      status?: AutomationJobStatus
      outputConfiguration?: { s3Uri?: string }
      errorType?: string
      errorMessage?: string
      jobSubmissionTime?: Date
      jobCompletionTime?: Date
    }
    const providerStatus = response.status ?? 'InProgress'
    return {
      status: mapStatus(response.status),
      providerStatus,
      outputS3Uri: response.outputConfiguration?.s3Uri ?? null,
      errorCode: response.errorType ?? null,
      errorMessage: response.errorMessage ?? null,
      submittedAt: response.jobSubmissionTime ?? null,
      completedAt: response.jobCompletionTime ?? null,
    }
  }
}

export const createBdaExtractor = (options?: BdaExtractorOptions): BdaExtractor => new BdaExtractor(options)
