import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { CsvObjectStore } from '../../src/modules/liquidity-statements/csv-object-store.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { buildCsvBytes, buildXlsxFixture } from './adapter-conformance/fixture-builders.js'
const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true}) })
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type FileKind = 'CSV' | 'XLSX'
const mimeFor = (kind: FileKind) => kind === 'CSV' ? 'text/csv' : XLSX_MIME
const originalBytes = (kind: FileKind) => kind === 'CSV'
  ? buildCsvBytes([['Symbol', 'Description', 'Value'], ['SYNTH', 'Synthetic \u20ac holding', '9007199254740993.125']], { encoding: 'UTF16LE', bom: true })
  : buildXlsxFixture({ sheets: [{ name: 'Synthetic holdings', rows: [{ index: 1, cells: [{ address: 'A1', kind: 'inlineString', value: 'Value' }, { address: 'B1', kind: 'number', value: '9007199254740993.125' }] }] }] })
const hashOf = (body: Buffer) => createHash('sha256').update(body).digest('hex')
// T044 adds an optional kind while retaining the original two-argument CSV API.
const statementKey = (store: CsvObjectStore, entityId: string, importId: string, kind: FileKind) =>
  (store.key as (entityId: string, importId: string, kind?: FileKind) => string)(entityId, importId, kind)
const s3Settings = () => buildLiquidityCsvConfig({ LIQUIDITY_CSV_OBJECT_STORE: 's3', LIQUIDITY_CSV_S3_BUCKET: 'synthetic-statements', LIQUIDITY_CSV_KMS_KEY_ARN: 'arn:aws:kms:us-west-1:111122223333:key/synthetic' }, true)
const syntheticS3Client = () => new S3Client({ region: 'us-west-1', credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-only' } })
describe('protected CSV originals', () => {
  it('signs conditional encrypted S3 PUTs and verifies version-pinned reads without network access', async () => {
    const settings=buildLiquidityCsvConfig({LIQUIDITY_CSV_OBJECT_STORE:'s3',LIQUIDITY_CSV_S3_BUCKET:'synthetic-csv',LIQUIDITY_CSV_KMS_KEY_ARN:'arn:aws:kms:us-west-1:111122223333:key/synthetic'},true)
    const client=new S3Client({region:'us-west-1',credentials:{accessKeyId:'SYNTHETIC',secretAccessKey:'synthetic-test-only'}})
    const body=Buffer.from('Symbol,Value\nTEST,800'),hash=createHash('sha256').update(body).digest('hex')
    const store=new CsvObjectStore(settings,'unused',client),key=store.key(randomUUID(),randomUUID())
    const upload=await store.uploadUrl(key,hash,body.length,'unused')
    expect(upload.requiredHeaders['If-None-Match']).toBe('*')
    expect(upload.requiredHeaders['x-amz-checksum-sha256']).toBe(Buffer.from(hash,'hex').toString('base64'))
    expect(new URL(upload.url).searchParams.get('X-Amz-SignedHeaders')).toContain('if-none-match')
    const response=()=>({VersionId:'version-1',ContentLength:body.length,ServerSideEncryption:'aws:kms',SSEKMSKeyId:settings.kmsKeyArn,Body:(async function*(){yield body})()})
    const send=vi.spyOn(client,'send').mockImplementation(async()=>response() as never)
    expect(await store.readVerified(key,'version-1',hash,body.length)).toEqual(body)
    expect((send.mock.calls[0]![0] as {input:unknown}).input).toMatchObject({VersionId:'version-1',Key:key})
    send.mockImplementation(async()=>({...response(),VersionId:'wrong'}) as never)
    await expect(store.readVerified(key,'version-1',hash,body.length)).rejects.toMatchObject({code:'STORAGE_MISMATCH'})
    client.destroy()
  })
  it('conditionally writes once and verifies exact version, hash, length and namespace', async () => {
    const root=await mkdtemp(join(tmpdir(),'atlas-csv-test-')); roots.push(root)
    const store=new CsvObjectStore(buildLiquidityCsvConfig({}),root)
    const key=store.key(randomUUID(),randomUUID())
    const body=Buffer.from('Symbol,Value\nDEMO,800')
    const hash=createHash('sha256').update(body).digest('hex')
    const version=await store.putLocal(key,body,hash,body.length)
    await expect(store.putLocal(key,body,hash,body.length)).rejects.toThrow()
    expect(await store.readVerified(key,version,hash,body.length)).toEqual(body)
    await expect(store.readVerified(key,'wrong',hash,body.length)).rejects.toThrow()
    await expect(store.readVerified(key,version,'a'.repeat(64),body.length)).rejects.toThrow()
    await expect(store.readVerified('../other',version,hash,body.length)).rejects.toThrow()
  })
  it('fails closed for production local or incomplete S3 configuration', () => {
    expect(()=>buildLiquidityCsvConfig({ LIQUIDITY_CSV_OBJECT_STORE:'local' },true)).toThrow()
    expect(()=>buildLiquidityCsvConfig({ LIQUIDITY_CSV_UPLOADS_ENABLED:'true' },true)).toThrow()
    expect(()=>buildLiquidityCsvConfig({ LIQUIDITY_CSV_MAX_ROWS:'25001' })).toThrow()
  })
})

describe('kind-aware protected statement originals', () => {
  it.each(['CSV', 'XLSX'] as const)('uses an ID-only %s key and canonical conditional local PUT headers', async kind => {
    const store = new CsvObjectStore(buildLiquidityCsvConfig({})), entityId = randomUUID(), importId = randomUUID()
    const body = originalBytes(kind), key = statementKey(store, entityId, importId, kind)
    expect(key).toBe(`liquidity-csv/${entityId}/${importId}/original.${kind.toLowerCase()}`)
    const upload = await store.uploadUrl(key, hashOf(body), body.length, '/authorized/local-content?token=synthetic')
    expect(upload).toEqual({ url: '/authorized/local-content?token=synthetic', requiredHeaders: { 'Content-Type': mimeFor(kind), 'If-None-Match': '*' } })
  })

  it('preserves the legacy two-argument key exactly', () => {
    const store = new CsvObjectStore(buildLiquidityCsvConfig({})), entityId = randomUUID(), importId = randomUUID()
    expect(store.key(entityId, importId)).toBe(`liquidity-csv/${entityId}/${importId}/original.csv`)
    expect(statementKey(store, entityId, importId, 'CSV')).toBe(store.key(entityId, importId))
  })

  it.each(['CSV', 'XLSX'] as const)('round-trips exact %s bytes immutably and rejects corrupt hash/length/version', async kind => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-statement-original-')); roots.push(root)
    const store = new CsvObjectStore(buildLiquidityCsvConfig({}), root)
    // Constructing the existing namespace directly also exercises legacy-key reads.
    const key = `liquidity-csv/${randomUUID()}/${randomUUID()}/original.${kind.toLowerCase()}`
    const body = originalBytes(kind), hash = hashOf(body)
    await expect(store.putLocal(key, body, 'b'.repeat(64), body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    await expect(store.putLocal(key, body, hash, body.length + 1)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    const version = await store.putLocal(key, body, hash, body.length)
    expect(version).toBe(hash)
    expect(await store.version(key)).toBe(version)
    expect(await store.readVerified(key, version, hash, body.length)).toEqual(body)
    expect(hashOf(await store.readVerified(key, version, hash, body.length))).toBe(hash)
    await expect(store.putLocal(key, Buffer.from('different original'), hashOf(Buffer.from('different original')), 18)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    await expect(store.readVerified(key, 'wrong-version', hash, body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    await expect(store.readVerified(key, version, 'b'.repeat(64), body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    await expect(store.readVerified(key, version, hash, body.length + 1)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    expect(await store.readVerified(key, version, hash, body.length)).toEqual(body)
  })

  it.each(['CSV', 'XLSX'] as const)('signs %s uploads with the right MIME, checksum, encryption and bounded expiry', async kind => {
    const settings = s3Settings(), client = syntheticS3Client(), store = new CsvObjectStore(settings, 'unused', client)
    try {
      const body = originalBytes(kind), hash = hashOf(body)
      const key = `liquidity-csv/${randomUUID()}/${randomUUID()}/original.${kind.toLowerCase()}`
      const upload = await store.uploadUrl(key, hash, body.length, 'unused')
      expect(upload.requiredHeaders).toEqual({
        'Content-Type': mimeFor(kind), 'If-None-Match': '*',
        'x-amz-checksum-sha256': Buffer.from(hash, 'hex').toString('base64'),
        'x-amz-server-side-encryption': 'aws:kms', 'x-amz-server-side-encryption-aws-kms-key-id': settings.kmsKeyArn,
      })
      const url = new URL(upload.url), signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')!.split(';')
      expect(signedHeaders).toEqual(expect.arrayContaining(['if-none-match', 'content-length', 'x-amz-checksum-sha256', 'x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']))
      expect(url.searchParams.get('X-Amz-Expires')).toBe(String(settings.capabilityTtlSeconds))
      expect(decodeURIComponent(url.pathname)).toContain(key)
    } finally { client.destroy() }
  })

  it.each(['CSV', 'XLSX'] as const)('pins safe %s S3 downloads to the stored version and fixed filename', async kind => {
    const client = syntheticS3Client(), store = new CsvObjectStore(s3Settings(), 'unused', client)
    try {
      const key = `liquidity-csv/${randomUUID()}/${randomUUID()}/original.${kind.toLowerCase()}`
      const url = new URL(await store.downloadUrl(key, 'synthetic-version/1+', 'unused'))
      expect(url.searchParams.get('versionId')).toBe('synthetic-version/1+')
      expect(url.searchParams.get('response-content-disposition')).toBe(`attachment; filename="brokerage-source.${kind.toLowerCase()}"`)
      expect(url.searchParams.get('response-content-type')).toBe(kind === 'CSV' ? 'text/plain' : XLSX_MIME)
      expect(url.searchParams.get('X-Amz-Expires')).toBe('120')
    } finally { client.destroy() }
  })

  it.each(['', 'null'])('refuses an unpinned S3 download version %j', async version => {
    const client = syntheticS3Client(), store = new CsvObjectStore(s3Settings(), 'unused', client)
    try { await expect(store.downloadUrl(store.key(randomUUID(), randomUUID()), version, 'unused')).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' }) }
    finally { client.destroy() }
  })

  it('rejects paths outside strict UUID namespaces and unsupported original extensions before signing', async () => {
    const store = new CsvObjectStore(buildLiquidityCsvConfig({})), entityId = randomUUID(), importId = randomUUID()
    const invalid = [
      `liquidity-csv/${'-'.repeat(36)}/${importId}/original.csv`,
      `liquidity-csv/${'a'.repeat(36)}/${importId}/original.csv`,
      `liquidity-csv/${entityId}/${importId}/original.xls`,
      `liquidity-csv/${entityId}/${importId}/original.xlsm`,
      `liquidity-csv/${entityId}/${importId}/original.xlsx.exe`,
      `liquidity-csv/${entityId}/${importId}/original.csv?name=private`,
      `liquidity-csv/${entityId}/${importId}/../original.csv`,
      `liquidity-csv/${entityId}/${importId}/%2e%2e/original.csv`,
      `liquidity-csv\\${entityId}\\${importId}\\original.xlsx`,
    ]
    for (const key of invalid) {
      await expect(store.uploadUrl(key, 'a'.repeat(64), 1, 'unused')).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
      await expect(store.downloadUrl(key, 'version-1', 'unused')).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
    }
    expect(() => statementKey(store, entityId, importId, 'PDF' as FileKind)).toThrow()
  })

  it.each(['CSV', 'XLSX'] as const)('checks %s S3 streamed bytes, version, encryption and length before returning an original', async kind => {
    const settings = s3Settings(), client = syntheticS3Client(), store = new CsvObjectStore(settings, 'unused', client)
    const body = originalBytes(kind), hash = hashOf(body), key = `liquidity-csv/${randomUUID()}/${randomUUID()}/original.${kind.toLowerCase()}`
    const response = (bytes = body) => ({ VersionId: 'version-1', ContentLength: body.length, ServerSideEncryption: 'aws:kms', SSEKMSKeyId: settings.kmsKeyArn, Body: (async function* () { yield bytes.subarray(0, 7); yield bytes.subarray(7) })() })
    const send = vi.spyOn(client, 'send').mockImplementation(async () => response() as never)
    try {
      expect(await store.readVerified(key, 'version-1', hash, body.length)).toEqual(body)
      expect((send.mock.calls[0]![0] as { input: unknown }).input).toMatchObject({ Key: key, VersionId: 'version-1', ChecksumMode: 'ENABLED' })
      for (const override of [{ VersionId: 'version-2' }, { ContentLength: body.length + 1 }, { ServerSideEncryption: 'AES256' }, { SSEKMSKeyId: 'wrong-key' }]) {
        send.mockImplementation(async () => ({ ...response(), ...override }) as never)
        await expect(store.readVerified(key, 'version-1', hash, body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
      }
      const corrupt = Buffer.from(body); corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1
      send.mockImplementation(async () => response(corrupt) as never)
      await expect(store.readVerified(key, 'version-1', hash, body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
      send.mockImplementation(async () => response(body.subarray(0, -1)) as never)
      await expect(store.readVerified(key, 'version-1', hash, body.length)).rejects.toMatchObject({ code: 'STORAGE_MISMATCH' })
      send.mockImplementation(async () => response(Buffer.concat([body, Buffer.from('x')])) as never)
      await expect(store.readVerified(key, 'version-1', hash, body.length)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    } finally { client.destroy() }
  })
})
