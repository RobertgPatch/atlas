import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'

import { config } from '../../../config.js'
import type {
  K1CompletionMessage,
  K1QueueMessage,
  K1ReceivedMessage,
  K1ReceiveOptions,
  K1StartWorkMessage,
  K1WorkQueue,
} from './K1WorkQueue.js'
import { parseK1QueueMessage } from './K1WorkQueue.js'
import { k1ExtractionAttemptRepository } from '../extraction/k1ExtractionAttempt.repository.js'

interface BdaEventBridgeEvent {
  id?: string
  source?: string
  time?: string
  'detail-type'?: string
  detail?: {
    job_id?: string
    job_status?: string
    output_s3_location?: { s3_bucket?: string; name?: string }
  }
}

const completionOutputKey = (name: string): string => {
  const normalized = name.replace(/\/+$/, '')
  const lastSlash = normalized.lastIndexOf('/')
  const finalPart = normalized.slice(lastSlash + 1)
  // Live BDA EventBridge events identify the numeric asset output directory
  // (for a one-document invocation this is usually /0), while the durable
  // manifest is stored beside that directory.
  return /^\d+$/.test(finalPart)
    ? `${normalized.slice(0, lastSlash + 1)}job_metadata.json`
    : normalized
}

export const parseBdaEventBridgeCompletion = async (
  value: unknown,
  resolveAttempt: (providerJobId: string) => ReturnType<typeof k1ExtractionAttemptRepository.getByProviderJobId> =
    (providerJobId) => k1ExtractionAttemptRepository.getByProviderJobId(providerJobId),
): Promise<K1CompletionMessage> => {
  const event = value as BdaEventBridgeEvent
  if (event.source !== 'aws.bedrock' || !event.detail?.job_id) throw new Error('INVALID_BDA_EVENTBRIDGE_COMPLETION')
  const attempt = await resolveAttempt(event.detail.job_id)
  if (!attempt?.providerJobId) throw Object.assign(new Error('BDA_COMPLETION_ATTEMPT_NOT_FOUND'), { code: 'BDA_COMPLETION_ATTEMPT_NOT_FOUND' })
  const detailType = event['detail-type'] ?? ''
  const providerStatus = detailType.endsWith('Succeeded') ? 'Success'
    : detailType.endsWith('Client Error') ? 'ClientError'
      : detailType.endsWith('Service Error') ? 'ServiceError'
        : event.detail.job_status ?? 'Unknown'
  const location = event.detail.output_s3_location
  return {
    version: 1,
    type: 'K1_EXTRACTION_COMPLETION',
    messageId: event.id ?? `bda:${event.detail.job_id}`,
    dedupeKey: `bda-completion:${attempt.id}:${event.detail.job_id}:${providerStatus}`,
    k1DocumentId: attempt.k1DocumentId,
    extractionAttemptId: attempt.id,
    providerJobId: attempt.providerJobId,
    providerStatus,
    output: location?.s3_bucket && location.name
      ? { key: completionOutputKey(location.name), bucket: location.s3_bucket, versionId: null }
      : null,
    occurredAt: event.time ?? new Date().toISOString(),
  }
}

export class SqsK1WorkQueue implements K1WorkQueue {
  readonly kind = 'sqs' as const
  private readonly client: SQSClient
  private readonly workQueueUrl: string
  private readonly completionQueueUrl: string
  private readonly receiptQueues = new Map<string, string>()

  constructor(args?: { client?: SQSClient; workQueueUrl?: string; completionQueueUrl?: string }) {
    this.client = args?.client ?? new SQSClient({
      region: config.aws.region,
      maxAttempts: Math.min(3, config.abuseProtection.retryBudgets.sqsMaximumReceives),
    })
    this.workQueueUrl = args?.workQueueUrl ?? config.k1Ingestion.sqs.workQueueUrl
    this.completionQueueUrl = args?.completionQueueUrl ?? config.k1Ingestion.sqs.completionQueueUrl
    if (!this.workQueueUrl || !this.completionQueueUrl) throw new Error('K1_SQS_QUEUE_URLS_REQUIRED')
  }

  private async send(queueUrl: string, message: K1QueueMessage): Promise<void> {
    const fifo = queueUrl.endsWith('.fifo')
    await this.client.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: fifo ? message.k1DocumentId : undefined,
      MessageDeduplicationId: fifo ? message.dedupeKey : undefined,
      MessageAttributes: {
        messageType: { DataType: 'String', StringValue: message.type },
        schemaVersion: { DataType: 'Number', StringValue: String(message.version) },
      },
    }))
  }

  sendStart(message: K1StartWorkMessage): Promise<void> {
    return this.send(this.workQueueUrl, message)
  }

  sendCompletion(message: K1CompletionMessage): Promise<void> {
    return this.send(this.completionQueueUrl, message)
  }

  private async receive<T extends K1QueueMessage>(
    queueUrl: string,
    messageKind: 'START' | 'COMPLETION',
    options: K1ReceiveOptions = {},
  ): Promise<Array<K1ReceivedMessage<T>>> {
    const response = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.max(1, Math.min(options.maxMessages ?? 10, 10)),
      WaitTimeSeconds: Math.max(0, Math.min(options.waitSeconds ?? 10, 20)),
      VisibilityTimeout: Math.max(1, options.visibilityTimeoutSeconds ?? 120),
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }))
    const received: Array<K1ReceivedMessage<T>> = []
    for (const entry of response.Messages ?? []) {
      if (!entry.ReceiptHandle || !entry.Body) continue
      const parsedBody = JSON.parse(entry.Body) as unknown
      const deliveryCount = Number(entry.Attributes?.ApproximateReceiveCount ?? 1)
      if (deliveryCount > config.abuseProtection.retryBudgets.sqsMaximumReceives) {
        throw Object.assign(new Error('K1_QUEUE_RECEIVE_LIMIT_EXCEEDED'), {
          code: 'K1_QUEUE_RECEIVE_LIMIT_EXCEEDED',
          deliveryCount,
        })
      }
      const message = (messageKind === 'COMPLETION'
        && (parsedBody as { source?: string }).source === 'aws.bedrock'
        ? await parseBdaEventBridgeCompletion(parsedBody)
        : parseK1QueueMessage(parsedBody)) as T
      this.receiptQueues.set(entry.ReceiptHandle, queueUrl)
      received.push({
        receipt: entry.ReceiptHandle,
        message,
        deliveryCount,
      })
    }
    return received
  }

  receiveStart(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1StartWorkMessage>>> {
    return this.receive(this.workQueueUrl, 'START', options)
  }

  receiveCompletion(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1CompletionMessage>>> {
    return this.receive(this.completionQueueUrl, 'COMPLETION', options)
  }

  async acknowledge(receipt: string): Promise<void> {
    const queueUrl = this.receiptQueues.get(receipt)
    if (!queueUrl) throw new Error('UNKNOWN_SQS_RECEIPT')
    await this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receipt }))
    this.receiptQueues.delete(receipt)
  }

  async retry(receipt: string, delaySeconds: number): Promise<void> {
    const queueUrl = this.receiptQueues.get(receipt)
    if (!queueUrl) throw new Error('UNKNOWN_SQS_RECEIPT')
    await this.client.send(new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receipt,
      VisibilityTimeout: Math.max(0, Math.min(delaySeconds, 43_200)),
    }))
  }
}
