import { describe, expect, it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { config } from '../../src/config.js'
import { csvFixture } from './testHelpers.js'
import { byteHash, csvRepository, hash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { CSV_ADAPTER_VERSION, parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'

describe.skipIf(!pool)('upload reservation and replay contracts', () => {
  it('reuses the saved custodian spelling for case, spacing and punctuation variants', async () => {
    const f=await csvFixture()
    const first=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'Merrill Lynch',name:'Primary',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    const second=await liquiditySourceRepository.create({entityId:f.entityId,custodian:'  MERRILL---LYNCH  ',name:'Secondary',currency:'USD',cadence:'ON_DEMAND'},f.scope)
    expect(first.custodian).toBe('Merrill Lynch')
    expect(second.custodian).toBe('Merrill Lynch')
    const upload=await f.service.upload({entityId:f.entityId,custodian:'merrill   lynch',fileName:'variant.csv',sizeBytes:1,sha256:byteHash('x'),contentType:'text/csv'},f.scope)
    expect((await csvRepository.detail(upload.statementId,f.scope)).summary.custodian).toBe('Merrill Lynch')
    await csvRepository.cancel(upload.statementId,upload.version,f.scope)
  })
  it('resumes uploaded immutable bytes, scopes duplicates and releases expired reservations', async () => {
    const f = await csvFixture(), body = Buffer.from(buildCsvFixture()), sha256 = byteHash(body)
    const input = { entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.csv', contentType: 'text/csv' as const, sizeBytes: body.length, sha256 }
    const cap = await f.service.upload(input, f.scope)
    const token = new URL(cap.url, 'http://localhost').searchParams.get('token')!
    await f.service.putLocal(cap.statementId, token, body, f.scope)
    const resumed = await f.service.upload(input, f.scope)
    expect(resumed).toMatchObject({ statementId: cap.statementId, duplicate: true })
    expect((await csvRepository.detail(cap.statementId, f.scope)).summary.status).toBe('QUEUED')
    await new CsvProcessingService(f.store).processOne(cap.statementId)
    const other = await f.service.upload({ ...input, entityId: f.otherEntityId }, f.scope)
    expect(other.statementId).not.toBe(cap.statementId)
    await pool!.query("update liquidity_csv_imports set capability_expires_at=now()-interval '1 second' where id=$1", [other.statementId])
    await new CsvProcessingService(f.store).expireReservations()
    const expired = (await pool!.query('select status,reservation_active from liquidity_csv_imports where id=$1', [other.statementId])).rows[0]
    expect(expired).toEqual({ status: 'CANCELLED', reservation_active: false })
  })
  it('reprocesses a duplicate review draft created by an older adapter version',async()=>{
    const f=await csvFixture(),body=Buffer.from(buildCsvFixture({format:'merrill'})),sha256=byteHash(body)
    const first=await f.upload(body.toString())
    const before=await csvRepository.get(first.id,f.scope)
    const parsed=await parseCsv(body)
    parsed.draft!.adapter.version='1.0.0'
    await pool!.query("update liquidity_csv_parse_runs set status='SUCCEEDED',canonical_draft=$2,canonical_hash=$3,reconciliation='{}',completed_at=now() where id=$1",[before.active_run_id,JSON.stringify(parsed.draft),hash(parsed.draft)])
    await pool!.query("update liquidity_csv_imports set status='NEEDS_REVIEW',version=version+1 where id=$1",[first.id])
    const duplicate=await f.service.upload({entityId:f.entityId,custodian:'Synthetic Broker',fileName:'synthetic.csv',sizeBytes:body.length,sha256,contentType:'text/csv'},f.scope)
    expect(duplicate).toMatchObject({statementId:first.id,duplicate:true})
    expect((await csvRepository.detail(first.id,f.scope)).summary.status).toBe('QUEUED')
    await new CsvProcessingService(f.store).processOne(first.id)
    expect((await csvRepository.detail(first.id,f.scope)).canonicalDraft?.adapter.version).toBe(CSV_ADAPTER_VERSION)
  })
  it('admits capabilities atomically and bounds bytes before reserving a slot', async () => {
    const f = await csvFixture(), prior = config.liquidityCsv.capabilitiesPerHour
    const body = Buffer.from(buildCsvFixture()), input = { entityId: f.entityId, custodian: 'Synthetic Broker', fileName: 'synthetic.csv', contentType: 'text/csv' as const, sizeBytes: body.length, sha256: byteHash(body) }
    try {
      config.liquidityCsv.capabilitiesPerHour = 1
      await expect(f.service.upload({ ...input, sizeBytes: 10485761 }, f.scope)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
      const results = await Promise.allSettled([f.service.upload(input, f.scope), f.service.upload({ ...input, sha256: byteHash('different bytes') }, f.scope)])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'QUOTA_EXCEEDED' } })
      const accepted = results.find(r => r.status === 'fulfilled')!
      if (accepted.status === 'fulfilled') await csvRepository.cancel(accepted.value.statementId, accepted.value.version, f.scope)
    } finally { config.liquidityCsv.capabilitiesPerHour = prior }
  })
})
