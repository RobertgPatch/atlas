import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { CsvObjectStore } from '../../src/modules/liquidity-statements/csv-object-store.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
const roots: string[] = []
afterEach(async () => { for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true}) })
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
