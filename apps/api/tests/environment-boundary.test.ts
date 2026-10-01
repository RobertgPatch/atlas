import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildRuntimeBoundaryConfig } from '../src/config.js'

const localBase = {
  NODE_ENV: 'development',
  ATLAS_RUNTIME: 'local',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:15432/atlas',
}

const localBda = {
  ...localBase,
  ATLAS_LOCAL_BDA_ENABLED: 'true',
  ATLAS_LOCAL_BDA_ACCOUNT_ID: '111122223333',
  AWS_REGION: 'us-west-2',
  K1_EXTRACTOR: 'aws_bda',
  K1_OBJECT_STORE: 's3',
  K1_QUEUE: 'local',
  K1_AWS_INGESTION_ENABLED: 'true',
  K1_UPLOADS_ENABLED: 'true',
  K1_EXTRACTION_ENABLED: 'true',
  K1_S3_BUCKET: 'atlas-production-k1-documents',
  K1_KMS_KEY_ARN: 'arn:aws:kms:us-west-2:111122223333:key/00000000-0000-0000-0000-000000000001',
  K1_BDA_PROFILE_ARN: 'arn:aws:bedrock:us-west-2:111122223333:data-automation-profile/us.data-automation-v1',
  K1_BDA_PROJECT_ARN: 'arn:aws:bedrock:us-west-2:111122223333:data-automation-project/000000000001',
  K1_BDA_PROJECT_STAGE: 'LIVE',
  ABUSE_K1_GLOBAL_FILES_PER_MONTH: '5',
  ABUSE_K1_BDA_CALLS_PER_MONTH: '10',
  ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS: '25000',
  ABUSE_BDA_MAX_ATTEMPTS: '1',
  ABUSE_K1_USER_FILES_PER_DAY: '3',
  ABUSE_K1_GLOBAL_FILES_PER_DAY: '3',
  ABUSE_K1_USER_DOCUMENTS_PER_DAY: '3',
  ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY: '3',
  ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT: '1',
}

describe('runtime environment boundary', () => {
  it('keeps the exported local BDA session authoritative after dotenv loads an old profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'atlas-bda-credentials-'))
    try {
      writeFileSync(join(directory, '.env'), 'AWS_PROFILE=retired-staging\nAWS_DEFAULT_PROFILE=retired-staging\n')
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('AWS_')))
      const child = spawnSync(process.execPath, [
        '--import', import.meta.resolve('tsx'), '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/config.ts', import.meta.url).href)});
         const { defaultProvider } = await import(${JSON.stringify(import.meta.resolve('@aws-sdk/credential-provider-node'))});
         const credentials = await defaultProvider()();
         console.log(JSON.stringify({ profile: process.env.AWS_PROFILE ?? null,
           defaultProfile: process.env.AWS_DEFAULT_PROFILE ?? null, accessKeyId: credentials.accessKeyId }));`,
      ], {
        cwd: directory, encoding: 'utf8', timeout: 10000,
        env: { ...inherited, ...localBda,
          AWS_ACCESS_KEY_ID: 'TEST_FAKE_LOCAL_BDA_KEY',
          AWS_SECRET_ACCESS_KEY: 'fake-test-secret', AWS_SESSION_TOKEN: 'fake-test-session',
        },
      })
      expect(child.status, child.stderr).toBe(0)
      expect(JSON.parse(child.stdout.trim())).toEqual({
        profile: null, defaultProfile: null, accessKeyId: 'TEST_FAKE_LOCAL_BDA_KEY',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('selects deterministic local adapters without AWS credentials', () => {
    const result = buildRuntimeBoundaryConfig(localBase)

    expect(result).toEqual({
      runtimeClass: 'local',
      databaseUrl: localBase.DATABASE_URL,
      k1ExtractorBackend: 'stub',
      k1ObjectStore: 'local',
      k1Queue: 'local',
      awsMutationAllowed: false,
    })
  })

  it.each([
    'postgres://user:password@database.internal/atlas',
    'postgres://user:password@atlas.production.rds.amazonaws.com/atlas',
    'postgres://user:password@10.0.1.20/atlas',
  ])('rejects a non-loopback local database before startup: %s', (databaseUrl) => {
    expect(() => buildRuntimeBoundaryConfig({ ...localBase, DATABASE_URL: databaseUrl }))
      .toThrow(/loopback PostgreSQL/i)
  })

  it.each([
    ['K1_EXTRACTOR', 'aws_bda'],
    ['K1_OBJECT_STORE', 's3'],
    ['K1_QUEUE', 'sqs'],
    ['K1_AWS_INGESTION_ENABLED', 'true'],
    ['MARKET_DATA_PROVIDER', 'alpaca'],
    ['K1_S3_BUCKET', 'atlas-production-documents'],
    ['AWS_APP_DOMAIN', 'app.example.com'],
  ])('rejects implicit provider activation through %s', (key, value) => {
    expect(() => buildRuntimeBoundaryConfig({ ...localBase, [key]: value }))
      .toThrow(/local runtime/i)
  })

  it('allows only the explicit local-to-AWS K-1 BDA provider boundary', () => {
    expect(buildRuntimeBoundaryConfig(localBda)).toEqual({
      runtimeClass: 'local',
      databaseUrl: localBase.DATABASE_URL,
      k1ExtractorBackend: 'aws_bda',
      k1ObjectStore: 's3',
      k1Queue: 'local',
      awsMutationAllowed: false,
    })
  })

  it.each([
    ['ATLAS_LOCAL_BDA_ACCOUNT_ID', ''],
    ['AWS_REGION', 'us-east-1'],
    ['K1_QUEUE', 'sqs'],
    ['K1_WORK_QUEUE_URL', 'https://sqs.us-west-2.amazonaws.com/111122223333/k1'],
    ['K1_UPLOADS_ENABLED', 'false'],
    ['K1_BDA_PROJECT_STAGE', 'DEVELOPMENT'],
    ['ABUSE_K1_BDA_CALLS_PER_MONTH', '11'],
    ['ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS', '1000'],
    ['K1_KMS_KEY_ARN', 'arn:aws:kms:us-west-2:999900001111:key/00000000-0000-0000-0000-000000000001'],
    ['K1_BDA_PROJECT_ARN', 'arn:aws:bedrock:us-east-1:111122223333:data-automation-project/000000000001'],
    ['MARKET_DATA_PROVIDER', 'alpaca'],
    ['ATLAS_ALLOW_AWS_MUTATION', 'true'],
  ])('rejects an unsafe or incomplete local BDA setting %s', (key, value) => {
    expect(() => buildRuntimeBoundaryConfig({ ...localBda, [key]: value })).toThrow()
  })

  it('requires explicit production runtime settings', () => {
    expect(() => buildRuntimeBoundaryConfig({ NODE_ENV: 'production' }))
      .toThrow(/ATLAS_RUNTIME=production/i)

    expect(() => buildRuntimeBoundaryConfig({
      NODE_ENV: 'production',
      ATLAS_RUNTIME: 'production',
      DATABASE_URL: 'postgres://user:password@database.internal/atlas',
      REQUIRE_DURABLE_PERSISTENCE: 'true',
      AWS_REGION: 'us-west-2',
      K1_EXTRACTOR: 'stub',
      K1_OBJECT_STORE: 'local',
      K1_QUEUE: 'local',
    })).not.toThrow()
  })

  it('rejects the retired scheduler-token alias in every runtime', () => {
    expect(() => buildRuntimeBoundaryConfig({
      ...localBase,
      ATLAS_SCHEDULER_TOKEN: 'retired-alias-must-not-be-used',
    })).toThrow(/PROJECT_JACKSON_SCHEDULER_TOKEN/i)
  })

  it.each(['us-west-1', 'us-west-2'])('accepts the live or planned production region %s', (region) => {
    expect(buildRuntimeBoundaryConfig({ NODE_ENV: 'production', ATLAS_RUNTIME: 'production',
      DATABASE_URL: 'postgres://user:password@database.internal/atlas',
      REQUIRE_DURABLE_PERSISTENCE: 'true', AWS_REGION: region }).runtimeClass).toBe('production')
  })

  it.each([
    ['DATABASE_URL', ''],
    ['DATABASE_URL', localBase.DATABASE_URL],
    ['REQUIRE_DURABLE_PERSISTENCE', 'false'],
    ['AWS_REGION', 'us-east-1'],
  ])('rejects invalid explicit production setting %s', (key, value) => {
    const production = {
      NODE_ENV: 'production',
      ATLAS_RUNTIME: 'production',
      DATABASE_URL: 'postgres://user:password@database.internal/atlas',
      REQUIRE_DURABLE_PERSISTENCE: 'true',
      AWS_REGION: 'us-west-2',
      [key]: value,
    }
    expect(() => buildRuntimeBoundaryConfig(production)).toThrow()
  })
})
