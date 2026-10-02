import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { aggregationResponseFixture } from '../src/features/partnership-tracker/__tests__/fixtures'

test('downloads all charts and a multi-page ledger without changing the current view', async ({ page }, testInfo) => {
  const prototype = aggregationResponseFixture.items[0]
  const items = Array.from({ length: 45 }, (_, index) => ({
    ...prototype,
    groupKey: `synthetic-${index}`,
    name: `Synthetic Fund ${String(index + 1).padStart(2, '0')}`,
    members: [0, 1].map((owner) => ({
      ...prototype.members[0],
      partnership: {
        ...prototype.members[0].partnership,
        id: `synthetic-${index}-${owner}`,
        name: `Synthetic Fund ${String(index + 1).padStart(2, '0')}`,
        entity: { id: `owner-${owner}`, name: `Synthetic Owner ${owner + 1}` },
        partnershipType: index % 2 ? 'Venture Capital' : 'Real Estate',
      },
      cashFlowEvents: [
        { id: `call-${index}-${owner}`, kind: 'CAPITAL_CALL', activityDate: '2025-01-01', amount: '60000.0000', feesAndCarry: '100.0000' },
        { id: `distribution-${index}-${owner}`, kind: 'DISTRIBUTION', activityDate: '2026-06-01', amount: '15000.0000', feesAndCarry: '10.0000' },
      ],
    })),
  }))
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/v1/auth/session') {
      await route.fulfill({ json: {
        user: { id: 'synthetic-user', email: 'test@example.test', displayName: 'Test user', role: 'User', accessLevel: 'User', status: 'Active' },
        role: 'User', session: { issuedAt: new Date().toISOString(), idleTimeoutSeconds: 3600, absoluteTimeoutSeconds: 7200 },
      } })
    } else if (path === '/v1/partnership-tracker/aggregation') {
      await route.fulfill({ json: { ...aggregationResponseFixture, items, pageInfo: { page: 1, totalPages: 1, totalItems: items.length } } })
    } else {
      await route.fulfill({ json: {} })
    }
  })
  await page.goto('/investment-tracker')
  await expect(page.getByRole('button', { name: 'Export to PDF' })).toBeEnabled()
  // Exercise filters and expansion with data extending far beyond the viewport.
  await page.getByRole('combobox', { name: 'Asset class' }).selectOption('Real Estate')
  await page.getByRole('button', { name: 'Expand Synthetic Fund 01 owner details' }).click()
  const table = page.getByRole('table', { name: 'Capital activity fund investment summary' })
  const scroller = table.locator('..')
  await scroller.evaluate((element) => { element.scrollTop = 500; element.scrollLeft = 200 })
  const scrollBefore = await scroller.evaluate((element) => [element.scrollTop, element.scrollLeft])
  const summaryScroller = page.getByRole('table', { name: 'Partnership activity summary for the full permitted portfolio' }).locator('..')
  // Reproduce a scroll area outside the marked ledger, including forced bars.
  await summaryScroller.evaluate((element) => {
    element.style.overflow = 'scroll'
    element.style.maxHeight = '120px'
    element.style.scrollbarGutter = 'stable'
  })
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Export to PDF' }).click()
  const capture = page.locator('[data-pdf-capture]')
  await expect(capture).toHaveCount(1)
  const scrollStyles = await capture.evaluate((root) => {
    const elements = [root, ...Array.from(root.querySelectorAll('*'))]
    return elements.map((element) => {
      const style = getComputedStyle(element)
      return { x: style.overflowX, y: style.overflowY, scrollbar: style.scrollbarWidth, gutter: style.scrollbarGutter }
    })
  })
  expect(scrollStyles.every((style) => style.scrollbar === 'none' && style.gutter === 'auto')).toBe(true)
  expect(scrollStyles.filter((style) => [style.x, style.y].some((value) => value === 'auto' || value === 'scroll'))).toEqual([])
  expect(await capture.locator('style').evaluate((element) => element.textContent)).toContain('::-webkit-scrollbar')
  const layout = await capture.evaluate((root) => {
    const heading = (text: string) => [...root.querySelectorAll('h2')].find((item) => item.textContent?.trim() === text) as HTMLElement
    const filterHeading = heading('Filter investments')
    const fundHeading = heading('Fund investment summary')
    const filterGrid = root.querySelector('[data-pdf-filter-grid]') as HTMLElement
    const fundTable = root.querySelector('table[aria-label="Capital activity fund investment summary"]') as HTMLTableElement
    const summary = root.querySelector('table[aria-label="Partnership activity summary for the full permitted portfolio"]') as HTMLTableElement
    const icons = [...summary.querySelectorAll('svg.lucide-info')].map((icon) => {
      const bounds = icon.getBoundingClientRect()
      const row = icon.closest('tr')!.getBoundingClientRect()
      return { right: bounds.right, centerOffset: Math.abs((bounds.top + bounds.bottom) / 2 - (row.top + row.bottom) / 2) }
    })
    const badges = [...summary.querySelectorAll('span')].filter((span) => span.textContent?.trim() === 'Calculated').map((badge) => ({
      bottom: badge.getBoundingClientRect().bottom,
      rowBottom: badge.closest('tr')!.getBoundingClientRect().bottom,
    }))
    return {
      filterHeadingHeight: filterHeading.getBoundingClientRect().height,
      filterLineHeight: Number.parseFloat(getComputedStyle(filterHeading).lineHeight),
      filterGap: filterGrid.getBoundingClientRect().top - filterHeading.getBoundingClientRect().bottom,
      fundHeadingHeight: fundHeading.getBoundingClientRect().height,
      fundLineHeight: Number.parseFloat(getComputedStyle(fundHeading).lineHeight),
      fundGap: fundTable.tHead!.getBoundingClientRect().top - fundHeading.getBoundingClientRect().bottom,
      icons,
      badges,
    }
  })
  expect(layout.filterHeadingHeight).toBeLessThanOrEqual(layout.filterLineHeight + 1)
  expect(layout.fundHeadingHeight).toBeLessThanOrEqual(layout.fundLineHeight + 1)
  expect(layout.filterGap).toBeGreaterThan(8)
  expect(layout.fundGap).toBeGreaterThan(8)
  expect(layout.icons).toHaveLength(7)
  expect(Math.max(...layout.icons.map((icon) => icon.right)) - Math.min(...layout.icons.map((icon) => icon.right))).toBeLessThan(2)
  expect(layout.icons.every((icon) => icon.centerOffset < 3)).toBe(true)
  expect(layout.badges).toHaveLength(3)
  expect(layout.badges.every((badge) => badge.bottom <= badge.rowBottom + 2)).toBe(true)
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^investment-tracker-all-partnerships-\d{4}-\d{2}-\d{2}\.pdf$/)
  const output = testInfo.outputPath('current-view.pdf')
  await download.saveAs(output)
  const pdf = await readFile(output)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g)!.length
  expect(pages).toBeGreaterThan(2)
  expect(pages).toBeLessThanOrEqual(4)
  await expect(page.getByRole('button', { name: 'Export to PDF' })).toBeEnabled()
  await expect(page.getByRole('combobox', { name: 'Asset class' })).toHaveValue('Real Estate')
  await expect(page.getByRole('button', { name: 'Collapse Synthetic Fund 01 owner details' })).toHaveAttribute('aria-expanded', 'true')
  expect(await scroller.evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual(scrollBefore)
  expect(await summaryScroller.evaluate((element) => [element.style.overflow, element.style.maxHeight, element.style.scrollbarGutter])).toEqual(['scroll', '120px', 'stable'])
  await expect(page.locator('[data-pdf-host]')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('keeps compact left padding and extra right padding on investment tracker icon buttons', async ({ page }, testInfo) => {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/v1/auth/session') {
      await route.fulfill({ json: {
        user: { id: 'synthetic-admin', email: 'admin@example.test', displayName: 'Test admin', role: 'Admin', accessLevel: 'Admin', status: 'Active' },
        role: 'Admin', session: { issuedAt: new Date().toISOString(), idleTimeoutSeconds: 3600, absoluteTimeoutSeconds: 7200 },
      } })
    } else if (path === '/v1/partnership-tracker/aggregation') {
      await route.fulfill({ json: { ...aggregationResponseFixture, pageInfo: { page: 1, totalPages: 1, totalItems: aggregationResponseFixture.items.length } } })
    } else {
      await route.fulfill({ json: {} })
    }
  })
  await page.goto('/investment-tracker')
  for (const name of ['Add partnership', 'Clear all', 'Export to PDF']) {
    const button = page.getByRole('button', { name })
    await expect(button).toBeVisible()
    const spacing = await button.evaluate((element) => {
      const icon = element.querySelector('svg')?.getBoundingClientRect()
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      if (!icon || !textNode) throw new Error('Expected a leading icon and a text label')
      const range = document.createRange()
      range.selectNodeContents(textNode)
      const label = range.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return {
        left: icon.left - bounds.left,
        right: bounds.right - label.right,
        verticalOffset: (Math.min(icon.top, label.top) + Math.max(icon.bottom, label.bottom)) / 2 - (bounds.top + bounds.bottom) / 2,
      }
    })
    // The approved layout uses the original 12px left inset and 20px at the label end,
    // plus the button's 1px border on each side.
    expect(spacing.left, name).toBeCloseTo(13, 0)
    expect(spacing.right, name).toBeCloseTo(21, 0)
    expect(Math.abs(spacing.verticalOffset), name).toBeLessThan(2)
  }
  await page.getByRole('button', { name: 'Add partnership' }).screenshot({ path: testInfo.outputPath('add-partnership-button.png') })
})
