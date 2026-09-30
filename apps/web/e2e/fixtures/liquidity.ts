/* eslint-disable no-empty-pattern, react-hooks/rules-of-hooks */
import { randomUUID } from 'node:crypto'
import { expect, test as base, type Page } from '@playwright/test'

export interface SyntheticLiquidityRun {
  id: string
  entityName: string
  accountName: string
  custodian: string
}

interface LiquidityFixtures {
  syntheticRun: SyntheticLiquidityRun
  adminPage: Page
}

export const test = base.extend<LiquidityFixtures>({
  syntheticRun: async ({}, use) => {
    const id = randomUUID()
    await use({
      id,
      entityName: `Synthetic statement entity ${id}`,
      accountName: `Synthetic statement account ${id}`,
      custodian: `Synthetic custodian ${id}`,
    })
  },

  adminPage: async ({ page }, use) => {
    const email = process.env.ATLAS_E2E_ADMIN_EMAIL ?? 'tpatch@jspllc.com'
    const password = process.env.ATLAS_E2E_ADMIN_PASSWORD ?? 'Synthetic statement e2e password 2026!'
    await page.goto('/')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 })
    if (['/mfa', '/mfa/setup', '/password/change'].includes(new URL(page.url()).pathname)) {
      throw new Error('The synthetic E2E Admin must be initialized without an MFA or password-change challenge')
    }
    await expect(page).toHaveURL(/\/(dashboard|liquidity|reports)/)
    await use(page)
  },
})

export { expect }
