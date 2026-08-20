import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'
import type { K1ObjectIdentity, K1ObjectStore } from '../src/modules/k1/storage/K1ObjectStore.js'
import { loadBdaProviderResult } from '../src/modules/k1/worker/k1Completion.handler.js'

const bucket = 'private-bucket'
const prefix = 'results/attempt/job/'
const manifestKey = `${prefix}job_metadata.json`
const standardKey = `${prefix}0/standard_output/0/result.json`
const customKey = `${prefix}0/custom_output/0/result.json`

const manifest = {
  job_id: 'job',
  job_status: 'Success',
  output_metadata: [{
    asset_id: 0,
    segment_metadata: [{
      standard_output_path: `s3://${bucket}/${standardKey}`,
      custom_output_path: `s3://${bucket}/${customKey}`,
      custom_output_status: 'MATCH',
    }],
  }],
}

const objects = new Map<string, Buffer>([
  [manifestKey, Buffer.from(JSON.stringify(manifest))],
  [standardKey, Buffer.from(JSON.stringify({ document: { elements: [] } }))],
  [customKey, Buffer.from(JSON.stringify({
    inference_result: {
      match__tax_year: 2025,
      calculation__box_1_ordinary_income_loss: '(1,250)',
    },
  }))],
])

const store = {
  kind: 's3',
  readRawResult: async (identity: K1ObjectIdentity) => {
    const bytes = objects.get(identity.key)
    if (!bytes) throw new Error('NOT_FOUND')
    return {
      body: Readable.from(bytes),
      metadata: {
        ...identity,
        bucket,
        contentType: 'application/json',
        sizeBytes: bytes.byteLength,
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        etag: null,
        lastModified: null,
        serverSideEncryption: 'aws:kms',
        kmsKeyId: 'kms-key',
      },
      contentRange: null,
    }
  },
} as unknown as K1ObjectStore

describe('BDA job manifest loader', () => {
  it('loads manifest-referenced custom and standard outputs before mapping', async () => {
    const loaded = await loadBdaProviderResult(store, { bucket, key: manifestKey }, 1_000_000)
    const draft = mapBdaResult(loaded.providerResult)

    expect(loaded.integritySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(draft.form.customOutputStatus).toBe('MATCH')
    expect(draft.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalPath: 'match.tax_year', normalizedValue: 2025 }),
      expect.objectContaining({
        canonicalPath: 'calculation.box_1_ordinary_income_loss',
        normalizedValue: '-1250.00',
      }),
    ]))
  })

  it('rejects manifest references outside the completed job prefix', async () => {
    const unsafeManifest = {
      ...manifest,
      output_metadata: [{ segment_metadata: [{
        standard_output_path: `s3://${bucket}/another-job/standard.json`,
        custom_output_path: `s3://${bucket}/${customKey}`,
        custom_output_status: 'MATCH',
      }] }],
    }
    const unsafeObjects = new Map(objects)
    unsafeObjects.set(manifestKey, Buffer.from(JSON.stringify(unsafeManifest)))
    const unsafeStore = {
      ...store,
      readRawResult: async (identity: K1ObjectIdentity) => {
        const bytes = unsafeObjects.get(identity.key)
        if (!bytes) throw new Error('NOT_FOUND')
        return {
          body: Readable.from(bytes),
          metadata: {
            ...identity, bucket, contentType: 'application/json', sizeBytes: bytes.byteLength,
            checksumSha256: createHash('sha256').update(bytes).digest('hex'), etag: null,
            lastModified: null, serverSideEncryption: 'aws:kms', kmsKeyId: 'kms-key',
          },
          contentRange: null,
        }
      },
    } as unknown as K1ObjectStore

    await expect(loadBdaProviderResult(unsafeStore, { bucket, key: manifestKey }, 1_000_000))
      .rejects.toMatchObject({ code: 'BDA_RESULT_PATH_OUTSIDE_JOB' })
  })
})
