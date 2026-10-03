import { expect, test } from '@playwright/test'
import { aggregationResponseFixture, commitmentFixtures, investmentPerformanceFixture, k1CashActivityDetailFixture, navFixtures, summaryFixture } from '../src/features/partnership-tracker/__tests__/fixtures'

test('consolidates activity, keeps the profile focused, and filters K1 Management', async ({ page }, testInfo) => {
  const items = ['Redwood Fund', 'Cedar Fund'].map((name, index) => {
    const id = `partnership-${index}`
    return {
      summary: { ...summaryFixture, partnership: { ...summaryFixture.partnership, id, name, aggregationGroupId: id } },
      investmentPerformance: { ...investmentPerformanceFixture, committedCapital: '600000.00' },
      cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents.map((flow) => ({ ...flow, id: `${id}-${flow.id}`, partnershipId: id,
        amount: flow.kind === 'DISTRIBUTION' ? '550000.00' : flow.amount,
        feesAndCarry: flow.kind === 'DISTRIBUTION' ? '10000.00' : '0.00',
      })),
      navEntries: navFixtures.map((entry) => ({ ...entry, id: `${id}-${entry.id}`, partnershipId: id })),
      commitments: commitmentFixtures, years: [], permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true },
    }
  })
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/v1/auth/session') return route.fulfill({ json: {
      user: { id: 'test-admin', email: 'admin@example.test', displayName: 'Test admin', role: 'Admin', accessLevel: 'Admin', status: 'Active' },
      role: 'Admin', session: { issuedAt: new Date().toISOString(), idleTimeoutSeconds: 3600, absoluteTimeoutSeconds: 7200 },
    } })
    if (path === '/v1/partnership-tracker/aggregation') return route.fulfill({ json: { ...aggregationResponseFixture,
      items: items.map((item) => ({ ...aggregationResponseFixture.items[0], groupKey: item.summary.partnership.id, name: item.summary.partnership.name, members: [{ ...item.summary, cashFlowEvents: item.cashFlowEvents }] })),
      pageInfo: { page: 1, totalPages: 1, totalItems: 2 },
    } })
    if (path === '/v1/partnership-tracker/activity') {
      const ids = url.searchParams.get('partnershipIds')?.split(',')
      const selected = items.filter((item) => !ids || ids.includes(item.summary.partnership.id))
      return route.fulfill({ json: { items: selected, investmentPerformance: { ...investmentPerformanceFixture, committedCapital: String(selected.length * 600000) }, cashOnCashYield: { value: '0.05', numeratorKnownCount: selected.length, totalCount: selected.length } } })
    }
    if (path.startsWith('/v1/partnership-tracker/partnerships/')) return route.fulfill({ json: items.find((item) => path.endsWith(item.summary.partnership.id)) })
    if (path === '/v1/k1-documents/kpis') return route.fulfill({ json: { counts: { UPLOADED: 0, PROCESSING: 0, NEEDS_REVIEW: url.searchParams.has('partnership_ids') ? 1 : 2, READY_FOR_APPROVAL: 0, FINALIZED: 0 } } })
    if (path === '/v1/k1-documents') {
      const ids = url.searchParams.get('partnership_ids')?.split(',')
      return route.fulfill({ json: { nextCursor: null, items: items.filter((item) => !ids || ids.includes(item.summary.partnership.id)).map((item, index) => ({
        id: `doc-${index}`, documentName: `${item.summary.partnership.name}.pdf`, partnership: item.summary.partnership, entity: item.summary.partnership.entity,
        taxYear: 2025, status: 'NEEDS_REVIEW', issuesOpenCount: 1, uploadedAt: '2026-10-01T00:00:00Z',
      })) } })
    }
    if (path === '/v1/k1-ingestion-batches') return route.fulfill({ json: { items: [], nextCursor: null, counts: { total: 0, active: 0, attentionRequired: 0, completed: 0 } } })
    return route.fulfill({ json: { items: [] } })
  })

  await page.goto('/investment-tracker')
  await expect(page.getByRole('heading', { level: 1, name: 'All Partnerships' })).toBeVisible()
  const performance = page.getByRole('table', { name: /Investment Performance for/ })
  await expect(performance.getByRole('row', { name: /Committed capital/ })).toContainText('$1,200,000')
  const capital = page.getByRole('table', { name: /Capital activity: dated/ })
  await expect(capital.getByText('Cedar Fund').first()).toBeVisible()
  await page.getByRole('button', { name: 'Fund filter: All funds' }).click()
  await page.getByRole('checkbox', { name: 'Redwood Fund' }).check()
  await page.keyboard.press('Escape')
  const cashReturned = page.getByRole('img', { name: '220% of cash paid returned; cash paid $250,000.00; net cash returned $550,000.00' })
  await expect(cashReturned).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Distributions by asset type' })).toHaveCount(0)
  const fundSummary = page.getByRole('table', { name: 'Capital activity fund investment summary' })
  expect(await fundSummary.evaluate((table) => Boolean(table.compareDocumentPosition(document.querySelector('table[aria-label^="Investment Performance for"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  await cashReturned.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('cash-returned-single-partnership.png') })
  await expect(performance.getByRole('row', { name: /Committed capital/ })).toContainText('$600,000')
  await expect(capital.getByText('Cedar Fund')).toHaveCount(0)
  await performance.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('all-partnerships-filtered.png'), fullPage: true })
  await capital.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('capital-activity.png') })
  await capital.getByRole('button', { name: /Edit capital call/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('row', { name: 'Open Redwood Fund partnership management' }).click()
  await expect(page.getByRole('heading', { name: 'Fund and owner details' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Financial commitment history' })).toBeVisible()
  await expect(page.getByRole('table', { name: /Investment Performance for/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add activity' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('partnership-profile.png'), fullPage: true })
  await page.getByRole('link', { name: 'K1 Management', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'K-1 Processing' })).toBeVisible()
  await expect(page.getByText('Cedar Fund.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Partnership filter: All partnerships' }).click()
  await page.getByRole('checkbox', { name: /Redwood Fund/ }).click()
  await expect(page.getByRole('checkbox', { name: /Redwood Fund/ })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Cedar Fund.pdf')).toHaveCount(0)
  await expect(page.getByText('Redwood Fund.pdf')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('k1-management.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByText('Redwood Fund.pdf')).toBeVisible()
  await page.getByRole('heading', { name: 'K-1 Processing' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('k1-management-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
