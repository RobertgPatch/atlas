import { describe, expect, it } from 'vitest'
import { assertLiquidityDatabaseTestEnvironment } from './testHelpers.js'

describe('liquidity statement test database guard', () => {
  it('allows ordinary unit runs without a configured database', () => {
    expect(() => assertLiquidityDatabaseTestEnvironment({}, false)).not.toThrow()
  })

  it('requires a configured database in the explicit acceptance mode', () => {
    expect(() => assertLiquidityDatabaseTestEnvironment({
      ATLAS_REQUIRE_LIQUIDITY_DB_TESTS: 'true',
    }, false)).toThrow('ATLAS_TEST_DATABASE_URL is required')
  })

  it.each([
    'postgres://atlas:secret@database.internal/atlas_test',
    'postgres://atlas:secret@atlas.production.rds.amazonaws.com/atlas',
    'not-a-postgres-url',
  ])('refuses a non-local or invalid acceptance database: %s', (databaseUrl) => {
    expect(() => assertLiquidityDatabaseTestEnvironment({
      ATLAS_REQUIRE_LIQUIDITY_DB_TESTS: 'true',
      ATLAS_TEST_DATABASE_URL: databaseUrl,
    }, true)).toThrow('dedicated loopback PostgreSQL')
  })

  it.each([
    'postgres://postgres:postgres@127.0.0.1:15432/atlas_test',
    'postgresql://postgres:postgres@localhost:15432/atlas_statement_test',
    'postgres://postgres:postgres@[::1]:15432/atlas_test',
  ])('accepts a configured loopback database in acceptance mode: %s', (databaseUrl) => {
    expect(() => assertLiquidityDatabaseTestEnvironment({
      ATLAS_REQUIRE_LIQUIDITY_DB_TESTS: 'true',
      ATLAS_TEST_DATABASE_URL: databaseUrl,
    }, true)).not.toThrow()
  })
})
