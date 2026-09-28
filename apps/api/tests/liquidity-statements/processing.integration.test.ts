import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { csvRepository } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'

describe.skipIf(!pool)('durable CSV parsing',()=>{
  it('persists one complete evidence set and makes replay harmless',async()=>{
    const f=await csvFixture(),u=await f.upload(buildCsvFixture()),processor=new CsvProcessingService(f.store)
    expect(u.completed.status).toBe('QUEUED')
    await processor.processOne(u.id)
    const detail=await csvRepository.detail(u.id,f.scope)
    expect(detail.summary.status).toBe('NEEDS_REVIEW')
    expect(detail.canonicalDraft!.accounts[0]!.positions[0]!.marketValue.value).toBe('800')
    expect(detail.records).toHaveLength(4)
    expect(await processor.processOne(u.id)).toBe(false)
    const replay=await f.service.complete(u.id,{expectedVersion:1,storageVersionId:u.result.storageVersionId,sha256:u.sha256},f.scope)
    expect(replay.id).toBe(u.id)
  })
  it('prevents a cancelled generation from persisting results',async()=>{
    const f=await csvFixture(),u=await f.upload(buildCsvFixture()),processor=new CsvProcessingService(f.store)
    const claim=await processor.claim(u.id)
    const row=await csvRepository.get(u.id,f.scope)
    await csvRepository.cancel(u.id,row.version,f.scope)
    expect(await processor.processClaim(claim!)).toBe(false)
    const d=await csvRepository.detail(u.id,f.scope)
    expect(d.summary.status).toBe('CANCELLED')
    expect(d.canonicalDraft).toBeNull()
  })
  it('recovers expired leases and retains unknown-layout records for mapping',async()=>{
    const f=await csvFixture(),u=await f.upload('Ticker,Value\nDEMO,80'),processor=new CsvProcessingService(f.store)
    const original=await processor.claim(u.id)
    await pool!.query("update liquidity_csv_parse_runs set lease_expires_at=now()-interval '1 minute' where id=$1",[original!.id])
    const replacement=await processor.claim(u.id)
    expect(replacement!.generation).toBeGreaterThan(original!.generation)
    expect(await processor.processClaim(original!)).toBe(false)
    expect(await processor.processClaim(replacement!)).toBe(true)
    const d=await csvRepository.detail(u.id,f.scope)
    expect(d.summary.status).toBe('NEEDS_MAPPING');expect(d.records).toHaveLength(2)
  })
})
