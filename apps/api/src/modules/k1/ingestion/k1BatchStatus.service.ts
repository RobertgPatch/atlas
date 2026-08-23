import type pg from 'pg'
import { durableK1BatchRepository } from '../k1.repository.js'

/**
 * Central transition boundary for callers that already own a transaction.
 * The repository locks and recomputes the parent batch before returning, so a
 * batch snapshot can never lag a committed item transition.
 */
export const transitionK1IngestionItem = (
  client: pg.PoolClient,
  itemId: string,
  args: Parameters<typeof durableK1BatchRepository.transitionItem>[2],
) => durableK1BatchRepository.transitionItem(client, itemId, args)

export const recomputeK1BatchStatus = (client: pg.PoolClient, batchId: string) =>
  durableK1BatchRepository.recomputeBatch(client, batchId)
