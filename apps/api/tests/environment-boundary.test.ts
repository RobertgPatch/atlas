import { describe, expect, it } from 'vitest'

import { buildRuntimeBoundaryConfig } from '../src/config.js'

const localBase = {
  NODE_ENV: 'development',
  ATLAS_RUNTIME: 'local',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:15432/atlas',
}

describe('runtime environment boundary', () => {
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
    ['PLAID_ENV', 'production'],
    ['K1_S3_BUCKET', 'atlas-production-documents'],
    ['AWS_APP_DOMAIN', 'app.example.com'],
  ])('rejects implicit provider activation through %s', (key, value) => {
    expect(() => buildRuntimeBoundaryConfig({ ...localBase, [key]: value }))
      .toThrow(/local runtime/i)
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
