import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { config } from '../../src/config.js'
import { csvFixture } from './testHelpers.js'
import { byteHash, csvRepository, hash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { CsvProcessingService } from '../../src/modules/liquidity-statements/csv-processing.service.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { liquiditySourceRepository } from '../../src/modules/liquidity-sources/liquidity-source.repository.js'
import { CSV_ADAPTER_VERSION, parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { CsvStatementService, csvStatementService } from '../../src/modules/liquidity-statements/liquidity-statement.service.js'
import { uploadRequestSchema } from '../../src/modules/liquidity-statements/liquidity-statement.zod.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'
import { buildCsvBytes, buildXlsxFixture, buildZipFixture } from './adapter-conformance/fixture-builders.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const binaryWorkbook = () => buildXlsxFixture({ sheets: [{ name: 'Synthetic holdings', rows: [
  { index: 1, cells: [{ address: 'A1', kind: 'inlineString', value: 'Symbol' }, { address: 'B1', kind: 'inlineString', value: 'Value' }] },
  { index: 2, cells: [{ address: 'A2', kind: 'inlineString', value: 'SYNTH' }, { address: 'B2', kind: 'number', value: '9007199254740993.125' }] },
] }] })
const requestMetadata = {
  entityId: '11111111-1111-4111-8111-111111111111', custodian: 'Synthetic Broker',
  fileName: 'synthetic.csv', contentType: 'text/csv', sizeBytes: 42, sha256: 'a'.repeat(64),
}
let httpFixture: TestFixture | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await httpFixture?.app.close()
  httpFixture = undefined
})

describe('statement upload metadata contract', () => {
  it.each(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'])('retains legacy CSV MIME %s with an omitted kind', contentType => {
    expect(uploadRequestSchema.parse({ ...requestMetadata, contentType })).toMatchObject({ fileKind: 'CSV' })
  })

  it('accepts explicit CSV and canonical XLSX metadata', () => {
    expect(uploadRequestSchema.parse({ ...requestMetadata, fileKind: 'CSV' })).toMatchObject({ fileKind: 'CSV', contentType: 'text/csv' })
    expect(uploadRequestSchema.parse({ ...requestMetadata, fileKind: 'XLSX', fileName: 'synthetic.XLSX', contentType: XLSX_MIME })).toMatchObject({ fileKind: 'XLSX', contentType: XLSX_MIME })
  })

  it.each([
    { fileKind: 'CSV', fileName: 'synthetic.xlsx', contentType: 'text/csv' },
    { fileKind: 'XLSX', fileName: 'synthetic.csv', contentType: XLSX_MIME },
    { fileKind: 'CSV', fileName: 'synthetic.csv', contentType: XLSX_MIME },
    { fileKind: 'XLSX', fileName: 'synthetic.xlsx', contentType: 'text/csv' },
    { fileName: 'synthetic.xlsx', contentType: XLSX_MIME },
    { fileKind: 'XLS', fileName: 'synthetic.xls', contentType: 'application/vnd.ms-excel' },
    { fileKind: 'XLSX', fileName: 'synthetic.xlsm', contentType: XLSX_MIME },
    { fileKind: 'CSV', fileName: 'synthetic.pdf', contentType: 'text/csv' },
    { fileName: 'synthetic.xls', contentType: 'application/vnd.ms-excel' },
    { fileName: 'synthetic.csv.exe', contentType: 'text/csv' },
    { fileKind: 'PDF', fileName: 'synthetic.pdf', contentType: 'application/pdf' },
  ])('rejects unsupported or contradictory kind, extension and MIME metadata: $fileName / $contentType', metadata => {
    expect(uploadRequestSchema.safeParse({ ...requestMetadata, ...metadata }).success).toBe(false)
  })

  it('does not issue a new XLSX capability while the default-off format gate is disabled', async () => {
    const previous = config.liquidityCsv.xlsxEnabled
    config.liquidityCsv.xlsxEnabled = false
    const service = new CsvStatementService()
    const capability = vi.spyOn(service.store, 'uploadUrl')
    try {
      const request = { ...requestMetadata, fileKind: 'XLSX' as const, fileName: 'synthetic.xlsx', contentType: XLSX_MIME }
      await expect(service.upload(request, { userId: randomUUID(), isAdmin: true, entityIds: [request.entityId] })).rejects.toMatchObject({ code: 'DISABLED' })
      expect(capability).not.toHaveBeenCalled()
    } finally { config.liquidityCsv.xlsxEnabled = previous }
  })
})

describe('authenticated local statement transport', () => {
  const utf16 = () => buildCsvBytes([['Symbol', 'Description', 'Value'], ['SYNTH', 'Synthetic euro \u20ac holding', '123.45']], { encoding: 'UTF16LE', bom: true })
  it.each([
    { label: 'UTF-8 CSV', mime: 'text/csv', bytes: () => buildCsvBytes([['Symbol', 'Value'], ['SYNTH', '123.45']]) },
    { label: 'UTF-16 CSV', mime: 'text/csv', bytes: utf16 },
    { label: 'plain-text CSV alias', mime: 'text/plain', bytes: utf16 },
    { label: 'Excel CSV alias', mime: 'application/vnd.ms-excel', bytes: utf16 },
    { label: 'binary XLSX', mime: XLSX_MIME, bytes: binaryWorkbook },
    { label: 'octet-stream original', mime: 'application/octet-stream', bytes: binaryWorkbook },
  ])('passes $label PUT bytes to storage without decoding or re-encoding', async ({ mime, bytes }) => {
    httpFixture = await createTestFixture()
    const body = bytes(), id = randomUUID(), token = 'b'.repeat(64), hash = byteHash(body)
    const put = vi.spyOn(csvStatementService, 'putLocal').mockResolvedValue({ storageVersionId: hash })
    const response = await httpFixture.app.inject({
      method: 'PUT', url: `/v1/liquidity-statements/${id}/content?token=${token}`,
      headers: { cookie: httpFixture.cookie, 'content-type': mime, 'if-none-match': '*' }, payload: body,
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ storageVersionId: hash })
    expect(put).toHaveBeenCalledTimes(1)
    const sent = put.mock.calls[0]!
    expect(sent[0]).toBe(id)
    expect(sent[1]).toBe(token)
    expect(Buffer.isBuffer(sent[2])).toBe(true)
    expect(sent[2]).toEqual(body)
    expect(byteHash(sent[2])).toBe(hash)
  })

  it('requires a conditional local PUT before accepting any original bytes', async () => {
    httpFixture = await createTestFixture()
    const put = vi.spyOn(csvStatementService, 'putLocal').mockResolvedValue({ storageVersionId: 'unused' })
    const response = await httpFixture.app.inject({
      method: 'PUT', url: `/v1/liquidity-statements/${randomUUID()}/content?token=${'b'.repeat(64)}`,
      headers: { cookie: httpFixture.cookie, 'content-type': 'text/csv' }, payload: 'Symbol,Value\nSYNTH,20',
    })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ error: 'STORAGE_MISMATCH' })
    expect(put).not.toHaveBeenCalled()
  })

  it.each(['legacy CSV', 'XLSX'] as const)('downloads %s with exact bytes, a fixed safe filename and nosniff', async kind => {
    httpFixture = await createTestFixture()
    const isXlsx = kind === 'XLSX', body = isXlsx ? binaryWorkbook() : utf16()
    const id = randomUUID(), hash = byteHash(body), extension = isXlsx ? 'xlsx' : 'csv'
    const key = `liquidity-csv/${randomUUID()}/${id}/original.${extension}`
    vi.spyOn(csvRepository, 'get').mockResolvedValue({
      id, file_kind: isXlsx ? 'XLSX' : undefined, file_name: `Private account 000000123456\r\nX-Evil: true.${extension}`,
      storage_key: key, storage_version: hash, sha256: hash, size_bytes: body.length,
    } as never)
    const read = vi.spyOn(csvStatementService.store, 'readVerified').mockResolvedValue(body)
    const response = await httpFixture.app.inject({ method: 'GET', url: `/v1/liquidity-statements/${id}/content`, headers: { cookie: httpFixture.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(body)
    expect(response.headers['content-disposition']).toBe(`attachment; filename="brokerage-source.${extension}"`)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-type']).toContain(isXlsx ? XLSX_MIME : 'text/plain')
    expect(JSON.stringify(response.headers)).not.toContain('000000123456')
    expect(response.headers['x-evil']).toBeUndefined()
    expect(read).toHaveBeenCalledWith(key, hash, hash, body.length)
  })
})

describe('upload capability integrity before persistence', () => {
  it.each(['put', 'complete'] as const)('rejects an expired capability for %s without reading or writing storage', async action => {
    const id = randomUUID(), token = 'c'.repeat(64), body = Buffer.from('Symbol,Value\nSYNTH,20'), hash = byteHash(body)
    const service = new CsvStatementService(), scope = { userId: randomUUID(), isAdmin: true, entityIds: [] }
    vi.spyOn(csvRepository, 'get').mockResolvedValue({ id, status: 'UPLOAD_PENDING', version: 1, storage_version: null, sha256: hash, size_bytes: body.length, capability_token_hash: byteHash(token), capability_expires_at: new Date(Date.now() - 60000) } as never)
    const read = vi.spyOn(service.store, 'readVerified'), write = vi.spyOn(service.store, 'putLocal')
    const request = action === 'put' ? service.putLocal(id, token, body, scope) : service.complete(id, { expectedVersion: 1, storageVersionId: hash, sha256: hash }, scope)
    await expect(request).rejects.toMatchObject({ code: 'CAPABILITY_EXPIRED' })
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('rejects a completion hash different from the authorized original before storage access', async () => {
    const service = new CsvStatementService(), id = randomUUID()
    vi.spyOn(csvRepository, 'get').mockResolvedValue({ id, sha256: 'a'.repeat(64), status: 'UPLOAD_PENDING', version: 1 } as never)
    const read = vi.spyOn(service.store, 'readVerified')
    await expect(service.complete(id, { expectedVersion: 1, storageVersionId: 'a'.repeat(64), sha256: 'b'.repeat(64) }, { userId: randomUUID(), isAdmin: true, entityIds: [] })).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    expect(read).not.toHaveBeenCalled()
  })
})

describe.skipIf(!pool)('upload reservation and replay contracts', () => {
  it.each([
    { label: 'XLSX renamed CSV', fileKind: 'CSV' as const, bytes: binaryWorkbook },
    { label: 'CSV renamed XLSX', fileKind: 'XLSX' as const, bytes: () => buildCsvBytes([['Symbol', 'Value'], ['SYNTH', '20']]) },
    { label: 'arbitrary ZIP renamed XLSX', fileKind: 'XLSX' as const, bytes: () => buildZipFixture([{ name: 'note.txt', data: 'Not a workbook' }]) },
    { label: 'OLE/encrypted workbook renamed CSV', fileKind: 'CSV' as const, bytes: () => Buffer.from('d0cf11e0a1b11ae10000000000000000', 'hex') },
  ])('rejects actual-content mismatch before queueing despite a valid upload hash: $label', async ({ fileKind, bytes }) => {
    const f = await csvFixture(), body = bytes(), sha256 = byteHash(body), prior = config.liquidityCsv.xlsxEnabled
    config.liquidityCsv.xlsxEnabled = true
    try {
      const input = { entityId: f.entityId, custodian: 'Synthetic Broker', fileKind, fileName: `synthetic.${fileKind.toLowerCase()}`, contentType: fileKind === 'CSV' ? 'text/csv' : XLSX_MIME, sizeBytes: body.length, sha256 }
      const cap = await f.service.upload(input, f.scope)
      const token = new URL(cap.url, 'http://localhost').searchParams.get('token')!
      const original = await f.service.putLocal(cap.statementId, token, body, f.scope)
      await expect(f.service.complete(cap.statementId, { expectedVersion: cap.version, storageVersionId: original.storageVersionId, sha256 }, f.scope)).rejects.toMatchObject({
        code: expect.stringMatching(/^(FILE_KIND_MISMATCH|UNSUPPORTED_FILE_KIND|MALFORMED_XLSX|STORAGE_MISMATCH)$/), statusCode: 422,
      })
      const row = await csvRepository.get(cap.statementId, f.scope)
      expect(row.status).toBe('REJECTED')
      expect(row.reservation_active).toBe(false)
      expect((await pool!.query('select id from liquidity_csv_parse_runs where import_id=$1', [cap.statementId])).rowCount).toBe(0)
      // Rejection does not mutate the protected original or rewrite it as CSV text.
      expect(await f.store.readVerified(row.storage_key, original.storageVersionId, sha256, body.length)).toEqual(body)
    } finally { config.liquidityCsv.xlsxEnabled = prior }
  })

  it('persists XLSX kind and original bytes through capability, local PUT and completion', async () => {
    const f = await csvFixture(), body = binaryWorkbook(), sha256 = byteHash(body), prior = config.liquidityCsv.xlsxEnabled
    config.liquidityCsv.xlsxEnabled = true
    try {
      const input = { entityId: f.entityId, custodian: 'Synthetic Broker', fileKind: 'XLSX' as const, fileName: 'synthetic.xlsx', contentType: XLSX_MIME, sizeBytes: body.length, sha256 }
      const cap = await f.service.upload(input, f.scope)
      expect(cap.requiredHeaders).toMatchObject({ 'Content-Type': XLSX_MIME, 'If-None-Match': '*' })
      const token = new URL(cap.url, 'http://localhost').searchParams.get('token')!
      const stored = await f.service.putLocal(cap.statementId, token, body, f.scope)
      await f.service.complete(cap.statementId, { expectedVersion: cap.version, storageVersionId: stored.storageVersionId, sha256 }, f.scope)
      const row = await csvRepository.get(cap.statementId, f.scope)
      expect(row).toMatchObject({ file_kind: 'XLSX', content_type: XLSX_MIME, status: 'QUEUED', storage_version: stored.storageVersionId })
      expect(row.storage_key).toBe(`liquidity-csv/${f.entityId}/${cap.statementId}/original.xlsx`)
      expect(await f.service.original(cap.statementId, f.scope)).toEqual(body)
    } finally { config.liquidityCsv.xlsxEnabled = prior }
  })

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
