import { pathToFileURL } from 'node:url'

import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'
import { getExtractor } from '../modules/k1/extraction/index.js'
import { isAsyncK1Extractor } from '../modules/k1/extraction/K1Extractor.js'
import { getK1WorkQueue } from '../modules/k1/queue/index.js'
import { K1ExtractionReconciler } from '../modules/k1/worker/k1ExtractionReconciler.js'

export const runK1ExtractionReconciliation = async (): Promise<void> => {
  if (!pool) throw new Error('DATABASE_URL is required for K-1 extraction reconciliation')
  await runMigrations(() => undefined)
  const extractor = getExtractor()
  if (!isAsyncK1Extractor(extractor)) throw new Error('An asynchronous K-1 extractor is required for reconciliation')
  const result = await new K1ExtractionReconciler({
    extractor,
    queue: getK1WorkQueue(),
  }).runOnce()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runK1ExtractionReconciliation()
    .then(() => pool?.end())
    .catch(async (error) => {
      process.stderr.write(`${(error as { code?: string }).code ?? 'K1_RECONCILIATION_FAILED'}\n`)
      await pool?.end()
      process.exitCode = 1
    })
}
