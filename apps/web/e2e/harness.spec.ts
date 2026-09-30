import { test, expect } from './fixtures/liquidity.js'

test('creates isolated synthetic statement identifiers', async ({ syntheticRun }) => {
  expect(syntheticRun.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(syntheticRun.entityName).toContain(syntheticRun.id)
  expect(syntheticRun.accountName).toContain(syntheticRun.id)
  expect(syntheticRun.custodian).toContain(syntheticRun.id)
})
