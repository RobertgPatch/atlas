import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../../config.js'
import type { buildLiquidityCsvConfig } from './liquidity-statement.config.js'
import type { StatementFileKind } from './liquidity-statement.types.js'
import { CsvError } from './liquidity-statement.errors.js'

type Settings = ReturnType<typeof buildLiquidityCsvConfig>
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const keyPattern = new RegExp(`^liquidity-csv/${uuid}/${uuid}/original[.](?:csv|xlsx)$`, 'u')
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const kindForKey = (key: string): StatementFileKind => key.endsWith('.xlsx') ? 'XLSX' : 'CSV'
const mimeForKey = (key: string) => kindForKey(key) === 'XLSX' ? XLSX_MIME : 'text/csv'
export class CsvObjectStore {
  private readonly s3: S3Client | null
  constructor(readonly settings: Settings = config.liquidityCsv, private readonly root = config.storageRoot, client?: S3Client) {
    this.s3 = settings.objectStore === 's3' ? client ?? new S3Client({region:settings.region}) : null
  }
  key(entityId: string, importId: string, kind: StatementFileKind = 'CSV') {
    if (kind !== 'CSV' && kind !== 'XLSX') throw new CsvError('STORAGE_MISMATCH')
    return this.safeKey(`liquidity-csv/${entityId}/${importId}/original.${kind.toLowerCase()}`)
  }
  private safeKey(key: string) { if (!keyPattern.test(key)) throw new CsvError('STORAGE_MISMATCH'); return key }
  private localPath(key: string) {
    const base=resolve(this.root), path=resolve(base,this.safeKey(key))
    if (!path.startsWith(base+sep)) throw new CsvError('STORAGE_MISMATCH')
    return path
  }
  async uploadUrl(key: string, sha256: string, size: number, localUrl: string) {
    this.safeKey(key)
    const contentType=mimeForKey(key)
    if (!this.s3) return { url:localUrl, requiredHeaders:{'Content-Type':contentType,'If-None-Match':'*'} }
    const requiredHeaders = { 'Content-Type':contentType, 'If-None-Match':'*', 'x-amz-checksum-sha256':Buffer.from(sha256,'hex').toString('base64'), 'x-amz-server-side-encryption':'aws:kms', 'x-amz-server-side-encryption-aws-kms-key-id':this.settings.kmsKeyArn }
    const url = await getSignedUrl(this.s3,new PutObjectCommand({ Bucket:this.settings.bucket,Key:key,ContentType:contentType,ContentLength:size,ChecksumSHA256:requiredHeaders['x-amz-checksum-sha256'],IfNoneMatch:'*',ServerSideEncryption:'aws:kms',SSEKMSKeyId:this.settings.kmsKeyArn }),{ expiresIn:this.settings.capabilityTtlSeconds,unhoistableHeaders:new Set(['content-length','x-amz-checksum-sha256','x-amz-server-side-encryption','x-amz-server-side-encryption-aws-kms-key-id']) })
    return {url,requiredHeaders}
  }
  async putLocal(key: string, body: Buffer, expectedHash: string, expectedSize: number): Promise<string> {
    if (this.s3) throw new CsvError('FORBIDDEN')
    this.verify(body,expectedHash,expectedSize)
    const path=this.localPath(key)
    await mkdir(dirname(path),{recursive:true})
    let handle
    try { handle=await open(path,'wx',0o600); await handle.writeFile(body); await handle.sync() }
    catch { throw new CsvError('STORAGE_MISMATCH') }
    finally { await handle?.close() }
    return expectedHash
  }
  verify(body: Buffer, hash: string, size: number) {
    if (body.length !== size || body.length > this.settings.maxBytes || createHash('sha256').update(body).digest('hex') !== hash) throw new CsvError('STORAGE_MISMATCH')
  }
  async readVerified(key: string, version: string, hash: string, size: number): Promise<Buffer> {
    this.safeKey(key)
    let body: Buffer
    if (!this.s3) {
      if (version !== hash) throw new CsvError('STORAGE_MISMATCH')
      body=await readFile(this.localPath(key))
    } else {
      if (!version || version === 'null') throw new CsvError('STORAGE_MISMATCH')
      const result=await this.s3.send(new GetObjectCommand({Bucket:this.settings.bucket,Key:key,VersionId:version,ChecksumMode:'ENABLED'}))
      if (result.VersionId !== version || result.ContentLength !== size || result.ServerSideEncryption !== 'aws:kms' || result.SSEKMSKeyId !== this.settings.kmsKeyArn || !result.Body) throw new CsvError('STORAGE_MISMATCH')
      const chunks: Buffer[]=[]; let bytes=0
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        bytes+=chunk.length
        if(bytes>this.settings.maxBytes || bytes>size) throw new CsvError('RESOURCE_LIMIT')
        chunks.push(Buffer.from(chunk))
      }
      body=Buffer.concat(chunks)
    }
    this.verify(body,hash,size)
    return body
  }
  async version(key: string): Promise<string> {
    this.safeKey(key)
    if(!this.s3) return createHash('sha256').update(await readFile(this.localPath(key))).digest('hex')
    const object=await this.s3.send(new HeadObjectCommand({Bucket:this.settings.bucket,Key:key}))
    if(!object.VersionId || object.VersionId==='null') throw new CsvError('STORAGE_MISMATCH')
    return object.VersionId
  }
  async downloadUrl(key:string,version:string,localUrl:string) {
    this.safeKey(key)
    if(!version||version==='null')throw new CsvError('STORAGE_MISMATCH')
    if(!this.s3) return localUrl
    const kind=kindForKey(key)
    return getSignedUrl(this.s3,new GetObjectCommand({Bucket:this.settings.bucket,Key:key,VersionId:version,ResponseContentDisposition:`attachment; filename="brokerage-source.${kind.toLowerCase()}"`,ResponseContentType:kind==='XLSX'?XLSX_MIME:'text/plain'}),{expiresIn:120})
  }
}
export const csvObjectStore = new CsvObjectStore()
