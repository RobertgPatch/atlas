import { config } from '../../../config.js'
import type { K1WorkQueue } from './K1WorkQueue.js'
import { localK1WorkQueue } from './localK1WorkQueue.js'
import { SqsK1WorkQueue } from './sqsK1WorkQueue.js'

let selectedQueue: K1WorkQueue | undefined

export const getK1WorkQueue = (): K1WorkQueue => {
  if (selectedQueue) return selectedQueue
  selectedQueue = config.k1Ingestion.queue === 'sqs'
    ? new SqsK1WorkQueue()
    : localK1WorkQueue
  return selectedQueue
}

export const setK1WorkQueueForTests = (queue?: K1WorkQueue): void => {
  selectedQueue = queue
}

export type { K1WorkQueue } from './K1WorkQueue.js'
