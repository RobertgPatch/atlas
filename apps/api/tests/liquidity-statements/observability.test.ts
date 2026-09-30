import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { csvMetrics, csvGauges, recordCsvOutcome, recordCsvReportState,recordStatementOutcome,statementMetrics } from '../../src/modules/liquidity-statements/csv-observability.js'
import { CsvError, csvErrors } from '../../src/modules/liquidity-statements/liquidity-statement.errors.js'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { csvReviewService } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { csvApplicationPreviewService } from '../../src/modules/liquidity-statements/csv-application-preview.service.js'
import { csvApplicationService } from '../../src/modules/liquidity-statements/csv-application.service.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'
it('admits only finite telemetry labels and safe errors', () => {
  const canary = 'ACCOUNT-FILENAME-SYMBOL-AMOUNT-CANARY'
  recordCsvOutcome('parse', 'success')
  recordCsvOutcome(canary as 'parse', 'success')
  expect(JSON.stringify(csvMetrics())).not.toContain(canary)
  expect(csvMetrics()['parse:success']).toBeGreaterThan(0)
  recordCsvReportState(false, 3)
  expect(csvGauges()).toEqual({ quotesEnabled: 0, overdueAccounts: 3 })
  recordCsvReportState(true, Number.NaN)
  expect(csvGauges()).toEqual({ quotesEnabled: 1, overdueAccounts: 0 })
  for (const key of Object.keys(csvErrors) as (keyof typeof csvErrors)[]) expect(new CsvError(key).message).not.toContain(canary)
})
it('uses only allowlisted statement dimensions and never cardinality-bearing canaries',()=>{
  const canary='PRIVATE-FILENAME-ACCOUNT-1234-$999'
  recordStatementOutcome({reader:'bounded_csv',adapter:'merrill_holdings_csv',version:'1.0.0',outcome:'matched',resourceBucket:'ordinary',correlationId:'11111111-1111-4111-8111-111111111111'})
  recordStatementOutcome({reader:canary,adapter:canary,version:canary,outcome:'matched',resourceBucket:'small',correlationId:canary})
  const serialized=JSON.stringify(statementMetrics())
  expect(serialized).not.toContain(canary);expect(serialized).toContain('bounded_csv:merrill_holdings_csv:1.0.0:matched:ordinary')
  expect(serialized).toContain('unknown:unknown:unknown:matched:small')
})

describe.skipIf(!pool)('durable statement audit', () => {
  it('records selection, apply, download, correction, abandonment, and cancellation without source names or financial values', async () => {
    const fixture = await csvFixture()
    const processor = new CsvProcessingService(fixture.store)
    const upload = await fixture.upload(buildCsvFixture({ format: 'merrill' }))
    await processor.processOne(upload.id)
    const target = await liquiditySourceRepository.create({ entityId: fixture.entityId, custodian: 'Synthetic Broker', name: 'Audit target', currency: 'USD', cadence: 'ON_DEMAND' }, fixture.scope)
    let detail = await csvRepository.detail(upload.id, fixture.scope)
    const binding = {
      occurrenceId: detail.canonicalDraft!.accounts[0]!.occurrenceId,
      accountId: target.id,
      expectedAccountVersion: target.version,
      completeAccount: true as const,
      emptyAccountConfirmed: false,
      acknowledgedIssueIds: detail.issues.filter((issue) => issue.severity === 'WARNING').map((issue) => issue.id),
    }
    detail = await csvReviewService.review(upload.id, { expectedVersion: detail.summary.version, changes: [], accountBindings: [binding] }, fixture.scope)
    const preview = await csvApplicationPreviewService.preview(upload.id, { expectedVersion: detail.summary.version, accountBindings: [binding] }, fixture.scope)
    await csvApplicationService.apply(upload.id, { previewId: preview.id, expectedVersion: preview.expectedVersion, summaryHash: preview.summaryHash, idempotencyKey: randomUUID() }, fixture.scope)
    await fixture.service.download(upload.id, fixture.scope)
    detail = await csvRepository.detail(upload.id, fixture.scope)
    await fixture.service.reprocess(upload.id, { expectedVersion: detail.summary.version, reason: 'Synthetic correction audit' }, fixture.scope)
    await processor.processOne(upload.id)
    detail = await csvRepository.detail(upload.id, fixture.scope)
    await csvRepository.cancel(upload.id, detail.summary.version, fixture.scope)

    const pending = await fixture.upload(buildCsvFixture({ date: '09/02/2026' }))
    await csvRepository.cancel(pending.id, pending.completed.version, fixture.scope)
    const audit = (await pool!.query('select event_name,before_json,after_json from audit_events where object_id = any($1::uuid[]) order by created_at,id', [[upload.id, pending.id]])).rows
    expect(audit.map((event) => event.event_name)).toEqual(expect.arrayContaining([
      'liquidity.statement.selection', 'liquidity.csv.apply', 'liquidity.csv.download',
      'liquidity.statement.reprocess', 'liquidity.statement.reprocess.abandoned', 'liquidity.csv.cancel',
    ]))
    const serialized = JSON.stringify(audit)
    expect(serialized).not.toContain('synthetic.csv')
    expect(serialized).not.toContain('09/02/2026')
    expect(serialized).not.toContain('Synthetic correction audit')
  })
})
