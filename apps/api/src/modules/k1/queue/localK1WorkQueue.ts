import { randomUUID } from 'node:crypto'

import { withTransaction } from '../../../infra/db/client.js'
import type {
  K1CompletionMessage,
  K1QueueMessage,
  K1ReceivedMessage,
  K1ReceiveOptions,
  K1StartWorkMessage,
  K1WorkQueue,
} from './K1WorkQueue.js'
import { parseK1QueueMessage } from './K1WorkQueue.js'

type QueueName = 'START_WORK' | 'COMPLETION'

export class LocalK1WorkQueue implements K1WorkQueue {
  readonly kind = 'local' as const

  private async send(queueName: QueueName, message: K1QueueMessage): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `insert into k1_local_queue_messages
           (id, queue_name, dedupe_key, payload)
         values ($1, $2, $3, $4)
         on conflict (queue_name, dedupe_key) do nothing`,
        [randomUUID(), queueName, message.dedupeKey, JSON.stringify(message)],
      )
    })
  }

  sendStart(message: K1StartWorkMessage): Promise<void> {
    return this.send('START_WORK', message)
  }

  sendCompletion(message: K1CompletionMessage): Promise<void> {
    return this.send('COMPLETION', message)
  }

  private async receive<T extends K1QueueMessage>(
    queueName: QueueName,
    options: K1ReceiveOptions = {},
  ): Promise<Array<K1ReceivedMessage<T>>> {
    const maxMessages = Math.max(1, Math.min(options.maxMessages ?? 10, 10))
    const visibility = Math.max(1, options.visibilityTimeoutSeconds ?? 120)
    return withTransaction(async (client) => {
      const rows = await client.query<{
        id: string
        payload: unknown
        delivery_count: number
      }>(
        `with ready as (
           select id
             from k1_local_queue_messages
            where queue_name = $1
              and available_at <= now()
              and (locked_until is null or locked_until <= now())
            order by available_at, created_at
            limit $2
            for update skip locked
         )
         update k1_local_queue_messages q
            set locked_until = now() + make_interval(secs => $3),
                delivery_count = q.delivery_count + 1
           from ready
          where q.id = ready.id
         returning q.id, q.payload, q.delivery_count`,
        [queueName, maxMessages, visibility],
      )
      return rows.rows.map((row) => ({
        receipt: `local:${row.id}`,
        message: parseK1QueueMessage(row.payload) as T,
        deliveryCount: row.delivery_count,
      }))
    })
  }

  receiveStart(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1StartWorkMessage>>> {
    return this.receive('START_WORK', options)
  }

  receiveCompletion(options?: K1ReceiveOptions): Promise<Array<K1ReceivedMessage<K1CompletionMessage>>> {
    return this.receive('COMPLETION', options)
  }

  async acknowledge(receipt: string): Promise<void> {
    const id = receipt.replace(/^local:/, '')
    await withTransaction(async (client) => {
      await client.query('delete from k1_local_queue_messages where id = $1', [id])
    })
  }

  async retry(receipt: string, delaySeconds: number): Promise<void> {
    const id = receipt.replace(/^local:/, '')
    await withTransaction(async (client) => {
      await client.query(
        `update k1_local_queue_messages
            set locked_until = null,
                available_at = now() + make_interval(secs => $2)
          where id = $1`,
        [id, Math.max(0, delaySeconds)],
      )
    })
  }
}

export const localK1WorkQueue = new LocalK1WorkQueue()
