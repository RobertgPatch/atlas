export const K1_QUEUE_MESSAGE_VERSION = 1 as const

export interface K1StartWorkMessage {
  version: typeof K1_QUEUE_MESSAGE_VERSION
  type: 'K1_EXTRACTION_START'
  messageId: string
  dedupeKey: string
  ingestionItemId: string
  k1DocumentId: string
  requestedAttemptNumber: number
  clientToken: string
  object: {
    key: string
    bucket: string | null
    versionId: string | null
  }
  enqueuedAt: string
}

export interface K1CompletionMessage {
  version: typeof K1_QUEUE_MESSAGE_VERSION
  type: 'K1_EXTRACTION_COMPLETION'
  messageId: string
  dedupeKey: string
  k1DocumentId: string
  extractionAttemptId: string
  providerJobId: string
  providerStatus: string
  output: {
    key: string
    bucket: string | null
    versionId: string | null
  } | null
  occurredAt: string
}

export type K1QueueMessage = K1StartWorkMessage | K1CompletionMessage

export interface K1ReceivedMessage<T extends K1QueueMessage> {
  receipt: string
  message: T
  deliveryCount: number
}

export interface K1ReceiveOptions {
  maxMessages?: number
  waitSeconds?: number
  visibilityTimeoutSeconds?: number
}

export interface K1WorkQueue {
  readonly kind: 'local' | 'sqs'
  sendStart(message: K1StartWorkMessage): Promise<void>
  sendCompletion(message: K1CompletionMessage): Promise<void>
  receiveStart(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1StartWorkMessage>>>
  receiveCompletion(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1CompletionMessage>>>
  acknowledge(receipt: string): Promise<void>
  retry(receipt: string, delaySeconds: number): Promise<void>
}

export const parseK1QueueMessage = (value: unknown): K1QueueMessage => {
  if (!value || typeof value !== 'object') throw new Error('INVALID_K1_QUEUE_MESSAGE')
  const candidate = value as Partial<K1QueueMessage>
  if (candidate.version !== K1_QUEUE_MESSAGE_VERSION) throw new Error('UNSUPPORTED_K1_QUEUE_MESSAGE_VERSION')
  if (candidate.type === 'K1_EXTRACTION_START') {
    if (!candidate.messageId || !candidate.dedupeKey || !candidate.k1DocumentId) {
      throw new Error('INVALID_K1_START_MESSAGE')
    }
    return candidate as K1StartWorkMessage
  }
  if (candidate.type === 'K1_EXTRACTION_COMPLETION') {
    if (!candidate.messageId || !candidate.dedupeKey || !candidate.k1DocumentId) {
      throw new Error('INVALID_K1_COMPLETION_MESSAGE')
    }
    return candidate as K1CompletionMessage
  }
  throw new Error('UNKNOWN_K1_QUEUE_MESSAGE')
}
