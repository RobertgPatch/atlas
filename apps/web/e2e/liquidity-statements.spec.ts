import { createHash } from 'node:crypto'
import type { Locator, Page, Request, Response } from '@playwright/test'
import type { ApplicationPreview, CsvDetail, UploadCapability } from '../../../packages/types/src/liquidity-statements.js'
import type { ConsolidatedHoldingsResponse } from '../../../packages/types/src/reports.js'
import { buildCsvBytes, buildXlsxFixture, merrillHeaders, type XlsxFixtureCell } from '../../api/tests/liquidity-statements/adapter-conformance/fixture-builders.js'
import { test, expect, type SyntheticLiquidityRun } from './fixtures/liquidity.js'

// Real local API/PostgreSQL journeys, not mocked successful import responses.
// Run against the isolated Playwright database with LIQUIDITY_XLSX_ENABLED=true.
// The only injected response is the explicitly tested transient detail failure.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ACCOUNT_VALUE = 1484.56
const processing = new Set(['UPLOAD_PENDING', 'VALIDATING', 'QUEUED', 'PARSING'])
const detailPath = /^\/v1\/liquidity-statements\/[a-f0-9-]{36}$/
const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const pathOf = (request: Request | Response) => new URL(request.url()).pathname

interface StatementFile {
  kind: 'CSV' | 'XLSX'
  name: string
  mimeType: string
  buffer: Buffer
  custodian: string
  symbol: string
  cashSymbol: string
}
interface SeededAccount { entityId: string; accountId: string; accountName: string; beforeTotal: number }
interface BrowserTraffic { requests: Request[]; details: Array<{ id: string; status: string }> }

function syntheticStatement(kind: StatementFile['kind'], run: SyntheticLiquidityRun): StatementFile {
  const suffix = run.id.replaceAll('-', '').slice(0, 8).toUpperCase()
  const symbol = `SYN${suffix}`, cashSymbol = `CASH${suffix}`
  if (kind === 'CSV') {
    return {
      kind, name: `synthetic-merrill-${run.id}.csv`, mimeType: 'text/csv', custodian: 'Merrill Lynch', symbol, cashSymbol,
      buffer: buildCsvBytes([
        [...merrillHeaders],
        ['09/21/2026', `S${suffix}`, symbol, '', `Synthetic review equity ${suffix}`, run.accountName, 'Trust', '0000004242', '10', '123.456', '1234.56', '-265.44', '-17.696', '1500', '0'],
        ['09/21/2026', `C${suffix}`, cashSymbol, '', 'ML Bank Deposit Program', run.accountName, 'Trust', '0000004242', '', '1', '250', '', '', '', '0'],
      ], { encoding: 'UTF16LE', bom: true }),
    }
  }
  const row = (index: number, values: string[], numeric = false) => ({
    index,
    cells: values.map((value, column): XlsxFixtureCell => {
      const address = `${String.fromCharCode(65 + column)}${index}`
      return numeric && /^-?\d+(?:\.\d+)?$/.test(value)
        ? { address, kind: 'number', value }
        : { address, kind: 'inlineString', value }
    }),
  })
  return {
    kind, name: `synthetic-morgan-${run.id}.xlsx`, mimeType: XLSX_MIME, custodian: 'Morgan Stanley', symbol, cashSymbol,
    buffer: buildXlsxFixture({ sheets: [{ name: 'Holdings', rows: [
      row(1, ['All Product Type By Security']),
      row(4, [`Holdings for Account ${run.accountName} - 4242 as of 09/21/2026 4:00 PM ET`]),
      row(7, ['Holding Summary']),
      row(8, ['Total Market Value:', '1484.56', 'Accrued Interest*:', '0', 'Total Cost:', '1500', 'Adjusted Cost:', '1500'], true),
      row(12, ['Name', 'Product Type', 'Open Order', 'Symbol', 'CUSIP', 'Last ($)', 'As of', 'Quantity', 'Market Value ($)', "Today's Change (%)", "Today's Change ($)", 'Total Cost ($)', 'Adjusted Cost ($)', 'Unrealized Gain/Loss (%)', 'Unrealized Gain/Loss ($)', 'Accrued Interest']),
      row(13, [`Synthetic review equity ${suffix}`, 'Other Holdings', 'No', symbol, '-', '123.456', '09/21/2026', '10', '1234.56', '-', '-', '1500', '1500', '-17.696', '-265.44', '0'], true),
      row(14, ['SYNTHETIC BANK DEPOSIT PROGRAM', 'Cash, MMF and BDP', 'No', cashSymbol, '-', '-', '-', '-', '250', '-', '-', '-', '-', '-', '-', '0'], true),
      row(15, ['Total', '-', '-', '-', '-', '-', '-', '-', '1484.56', '-', '-', '1500', '1500', '-', '-265.44', '0'], true),
    ] }] }),
  }
}

function recordTraffic(page: Page): BrowserTraffic {
  const traffic: BrowserTraffic = { requests: [], details: [] }
  page.on('request', request => {
    if (pathOf(request).startsWith('/v1/liquidity-statements')) traffic.requests.push(request)
  })
  page.on('response', response => {
    if (response.request().method() === 'GET' && detailPath.test(pathOf(response)) && response.ok()) {
      void response.json().then((detail: CsvDetail) => {
        traffic.details.push({ id: detail.summary.id, status: detail.summary.status })
      }).catch(() => {})
    }
  })
  return traffic
}

async function readReport(page: Page, accountId?: string): Promise<ConsolidatedHoldingsResponse> {
  const query = new URLSearchParams({ pricingMode: 'saved', pageSize: '1000', ...(accountId ? { accountId } : {}) })
  const response = await page.request.get(`/v1/reports/consolidated-holdings?${query}`)
  expect(response.ok()).toBe(true)
  return response.json() as Promise<ConsolidatedHoldingsResponse>
}

async function seedAccount(page: Page, run: SyntheticLiquidityRun, file: StatementFile): Promise<SeededAccount> {
  const headers = { Origin: new URL(page.url()).origin }
  const entity = await page.request.post('/v1/entities', { headers, data: { name: run.entityName, kind: 'trust', jurisdiction: 'Synthetic test jurisdiction', taxId: '', formedOn: '' } })
  expect(entity.status()).toBe(201)
  const { id: entityId } = await entity.json() as { id: string }
  const account = await page.request.post('/v1/liquidity-source-accounts', { headers, data: { entityId, custodian: file.custodian, name: run.accountName, accountMask: '4242', currency: 'USD', cadence: 'ON_DEMAND' } })
  expect(account.status()).toBe(201)
  const { id: accountId } = await account.json() as { id: string }
  const report = await readReport(page)
  expect(report.pricingCapability?.realTimeEquitiesEnabled).toBe(false)
  return { entityId, accountId, accountName: run.accountName, beforeTotal: report.kpis.totalMarketValue ?? 0 }
}

async function browserUpload(page: Page, account: SeededAccount, file: StatementFile) {
  await page.goto('/liquidity')
  await page.getByRole('button', { name: /Upload statements/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Entity', exact: true }).selectOption(account.entityId)
  await dialog.getByRole('combobox', { name: 'Custodian', exact: true }).selectOption(file.custodian)
  const input = dialog.locator('input[type="file"]')
  await expect(input).toHaveAttribute('accept', /\.csv/)
  await expect(input).toHaveAttribute('accept', /\.xlsx/)
  await input.setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer })

  const capabilityResponse = page.waitForResponse(response => pathOf(response) === '/v1/liquidity-statements/upload-capability' && response.request().method() === 'POST')
  const putResponse = page.waitForResponse(response => /\/liquidity-statements\/[^/]+\/content$/.test(pathOf(response)) && response.request().method() === 'PUT')
  const completeResponse = page.waitForResponse(response => /\/liquidity-statements\/[^/]+\/complete$/.test(pathOf(response)) && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: /^Upload (?:statement|statements|file)$/i }).click()
  const capabilityHttp = await capabilityResponse
  expect(capabilityHttp.status()).toBe(201)
  const capability = await capabilityHttp.json() as UploadCapability
  const sha256 = createHash('sha256').update(file.buffer).digest('hex')
  expect(capabilityHttp.request().postDataJSON()).toMatchObject({ entityId: account.entityId, custodian: file.custodian, fileKind: file.kind, fileName: file.name, contentType: file.mimeType, sizeBytes: file.buffer.length, sha256 })
  expect(capability.duplicate).not.toBe(true)
  expect(capability.requiredHeaders).toMatchObject({ 'Content-Type': file.mimeType, 'If-None-Match': '*' })

  const putHttp = await putResponse
  expect(putHttp.status()).toBe(201)
  expect(pathOf(putHttp)).toBe(`/v1/liquidity-statements/${capability.statementId}/content`)
  expect(putHttp.request().headers()['content-type']).toBe(file.mimeType)
  expect(putHttp.request().headers()['if-none-match']).toBe('*')
  expect(putHttp.request().postDataBuffer()).toEqual(file.buffer)
  const { storageVersionId } = await putHttp.json() as { storageVersionId: string }
  expect(storageVersionId).toBeTruthy()

  const completeHttp = await completeResponse
  expect(completeHttp.status()).toBe(202)
  expect(pathOf(completeHttp)).toBe(`/v1/liquidity-statements/${capability.statementId}/complete`)
  expect(completeHttp.request().postDataJSON()).toEqual({ expectedVersion: capability.version, storageVersionId, sha256 })
  return { dialog, statementId: capability.statementId }
}

async function waitForReview(dialog: Locator, file: StatementFile, traffic: BrowserTraffic, statementId: string) {
  await expect(dialog.getByRole('combobox', { name: `Category for ${file.symbol}`, exact: true })).toBeVisible({ timeout: 45_000 })
  await expect.poll(() => traffic.details.some(detail => detail.id === statementId && ['NEEDS_REVIEW', 'READY_TO_APPLY'].includes(detail.status))).toBe(true)
  const details = traffic.details.filter(detail => detail.id === statementId)
  // Fast files may be ready on the first GET. If a processing response was
  // observed, a later real GET must have advanced the UI without a reload.
  if (details.some(detail => processing.has(detail.status))) expect(details.length).toBeGreaterThan(1)
  await expect(dialog.getByText('Unable to load this draft.', { exact: true })).toBeHidden()
}

async function reviewPreviewApply(page: Page, dialog: Locator, account: SeededAccount, file: StatementFile, statementId: string) {
  const category = dialog.getByRole('combobox', { name: `Category for ${file.symbol}`, exact: true })
  const holdingRow = category.locator('xpath=ancestor::tr[1]')
  await expect(holdingRow.getByRole('cell', { name: '$1,234.56', exact: true })).toBeVisible()
  await expect(holdingRow.getByRole('cell', { name: /\$1,500\.00/ })).toBeVisible()
  await expect(holdingRow.getByRole('cell', { name: '-$265.44', exact: true })).toBeVisible()
  await expect(category).toHaveValue('other')
  await category.selectOption('equity')
  await dialog.getByRole('combobox', { name: 'Replace holdings in account', exact: true }).selectOption(account.accountId)
  const cashCategory=dialog.getByRole('combobox', { name: `Category for ${file.cashSymbol}`, exact: true })
  const cashRow = cashCategory.locator('xpath=ancestor::tr[1]')
  await expect(cashRow).toContainText('Unavailable') // Value-only cash has no fabricated quantity.
  await expect(cashRow).toContainText('$250.00')
  await expect(cashCategory).toHaveValue('cash')
  const allWarnings = dialog.getByRole('checkbox', { name: /acknowledge all warnings/i })
  if (await allWarnings.isVisible()) await allWarnings.check()

  const reviewResponse = page.waitForResponse(response => pathOf(response) === `/v1/liquidity-statements/${statementId}/review` && response.request().method() === 'PATCH')
  await dialog.getByRole('button', { name: 'Save review', exact: true }).click()
  const reviewed = await reviewResponse
  expect(reviewed.status()).toBe(200)
  const reviewRequest = reviewed.request().postDataJSON() as { changes: Array<{ fieldPath: string; value: string }>; accountBindings: Array<{ accountId: string; completeAccount: boolean }> }
  expect(reviewRequest.changes).toContainEqual(expect.objectContaining({ fieldPath: 'accounts.0.positions.0.assetType', value: 'equity' }))
  expect(reviewRequest.accountBindings).toContainEqual(expect.objectContaining({ accountId: account.accountId, completeAccount: true }))
  await expect(dialog.getByRole('combobox', { name: `Category for ${file.symbol}`, exact: true })).toHaveValue('equity')

  const previewResponse = page.waitForResponse(response => pathOf(response) === `/v1/liquidity-statements/${statementId}/application-preview` && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click()
  const previewHttp = await previewResponse
  expect(previewHttp.status()).toBe(200)
  const preview = await previewHttp.json() as ApplicationPreview
  expect(preview.canApply).toBe(true)
  expect(preview.accounts).toHaveLength(1)
  expect(preview.accounts[0]).toMatchObject({ accountId: account.accountId, nextValue: '1484.56', willBecomeCurrent: true })
  await expect(dialog.getByRole('heading', { name: 'Review the changes before applying', exact: true })).toBeVisible()
  expect((await readReport(page, account.accountId)).rows).toHaveLength(0)

  const applyResponse = page.waitForResponse(response => pathOf(response) === `/v1/liquidity-statements/${statementId}/apply` && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Apply snapshot', exact: true }).click()
  const applied = await applyResponse
  expect(applied.status()).toBe(200)
  expect(applied.request().postDataJSON()).toMatchObject({ previewId: preview.id, expectedVersion: preview.expectedVersion, summaryHash: preview.summaryHash, idempotencyKey: expect.any(String) })
  expect((await applied.json() as { snapshotIds: string[] }).snapshotIds).toHaveLength(1)
  await expect(dialog.getByRole('heading', { name: /\bapplied$/i })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
}

async function assertPortfolioAndAccountRow(page: Page, account: SeededAccount, file: StatementFile) {
  const hero = page.getByText('Total Portfolio Value', { exact: true }).locator('..')
  await expect(hero.getByRole('heading', { name: usd(account.beforeTotal + ACCOUNT_VALUE), exact: true })).toBeVisible()
  await page.getByPlaceholder('Search symbol, name, or custodian...').fill(file.symbol)
  const expand = page.getByRole('button', { name: `Expand ${file.symbol} account details`, exact: true })
  if (!await expand.isVisible()) await page.getByRole('row').filter({ has: page.locator('[title="Equities"]') }).click()
  await expect(expand).toHaveCount(1)
  await expand.click()
  const child = page.getByText(account.accountName,{exact:true}).locator('xpath=ancestor::tr[1]')
  await expect(child).toHaveCount(1)
  await expect(child).toContainText(file.custodian)
  await expect(child).toContainText('4242')
  await expect(child).toContainText('$1,234.56')
  await expect(child).toContainText('$1,500.00')
  const report = await readReport(page, account.accountId)
  expect(report.kpis.totalMarketValue).toBe(ACCOUNT_VALUE)
  expect(report.kpis.totalCostBasis).toBe(1750)
  expect(report.kpis.totalUnrealizedGainLoss).toBe(-265.44)
  expect(report.rows).toHaveLength(2)
  expect(report.rows.find(row => row.symbol === file.symbol)).toMatchObject({ quantity: 10, type: 'Stock', marketValue: 1234.56, costBasis: 1500 })
  expect(report.rows.find(row => row.symbol === file.cashSymbol)).toMatchObject({ quantity: null, type: 'Cash', marketValue: 250, costBasis: 250 })
}

test.describe('statement upload to durable Liquidity', () => {
  test.setTimeout(90_000)

  for (const kind of ['CSV', 'XLSX'] as const) {
    test(`${kind}: real upload bytes, review, preview and apply persist after navigation and authenticated reload`, async ({ adminPage: page, syntheticRun }) => {
      const file = syntheticStatement(kind, syntheticRun), traffic = recordTraffic(page)
      const account = await seedAccount(page, syntheticRun, file)
      const { dialog, statementId } = await browserUpload(page, account, file)
      await waitForReview(dialog, file, traffic, statementId)
      await reviewPreviewApply(page, dialog, account, file, statementId)
      await assertPortfolioAndAccountRow(page, account, file)

      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await expect(page).toHaveURL(/\/dashboard$/)
      await page.getByRole('link', { name: 'Liquidity', exact: true }).click()
      await assertPortfolioAndAccountRow(page, account, file)

      const authenticated = page.waitForResponse(response => pathOf(response) === '/v1/auth/session' && response.request().method() === 'GET')
      await page.reload()
      expect((await authenticated).status()).toBe(200)
      await expect(page).toHaveURL(/\/liquidity$/)
      await assertPortfolioAndAccountRow(page, account, file)
      expect(traffic.requests.filter(request => request.method() === 'POST' && pathOf(request).endsWith('/upload-capability'))).toHaveLength(1)
      expect(traffic.requests.filter(request => request.method() === 'POST' && pathOf(request).endsWith('/apply'))).toHaveLength(1)
    })
  }

  test('a retryable draft-load failure recovers the original upload without re-uploading or losing review', async ({ adminPage: page, syntheticRun }) => {
    const file = syntheticStatement('CSV', syntheticRun), traffic = recordTraffic(page)
    const account = await seedAccount(page, syntheticRun, file)
    const detailUrl = /\/v1\/liquidity-statements\/[a-f0-9-]{36}(?:\?.*)?$/
    let failures = 0
    await page.route(detailUrl, async route => {
      if (route.request().method() !== 'GET') return route.continue()
      failures += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TRANSIENT_FAILURE', message: 'Synthetic retryable draft-load failure.' }) })
    })
    const { dialog, statementId } = await browserUpload(page, account, file)
    await expect(dialog.getByRole('alert').filter({ hasText: 'Unable to load this draft.' })).toBeVisible({ timeout: 20_000 })
    expect(failures).toBeGreaterThan(0)
    await expect(dialog.getByRole('button', { name: 'Apply snapshot', exact: true })).toBeHidden()
    await page.unroute(detailUrl)
    await dialog.getByRole('button', { name: 'Retry loading draft', exact: true }).click()
    await waitForReview(dialog, file, traffic, statementId)
    await reviewPreviewApply(page, dialog, account, file, statementId)
    await assertPortfolioAndAccountRow(page, account, file)
    expect(traffic.requests.filter(request => request.method() === 'POST' && pathOf(request).endsWith('/upload-capability'))).toHaveLength(1)
    expect(traffic.requests.filter(request => request.method() === 'PUT' && pathOf(request).endsWith('/content'))).toHaveLength(1)
    expect(traffic.requests.filter(request => request.method() === 'POST' && pathOf(request).endsWith('/complete'))).toHaveLength(1)
  })
})
