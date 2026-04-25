import ExcelJS from 'exceljs'
import type {
  ReportExportFormat,
  ReportExportQuery,
  ReportType,
} from './reports.zod.js'
import { reportsRepository, type ReportsScope } from './reports.repository.js'

type ExportCell = string | number | boolean | null

interface TabularExportData {
  headers: string[]
  rows: ExportCell[][]
}

export interface GeneratedReportExport {
  fileName: string
  contentType: string
  body: Buffer
}

const CSV_MIME_TYPE = 'text/csv; charset=utf-8'
const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const toCsvCell = (value: ExportCell): string => {
  if (value == null) return ''
  const str = String(value)
  if (!/[",\n\r]/.test(str)) return str
  return `"${str.replace(/"/g, '""')}"`
}

const toCsvBuffer = (headers: string[], rows: ExportCell[][]): Buffer => {
  const lines = [
    headers.map((header) => toCsvCell(header)).join(','),
    ...rows.map((row) => row.map((value) => toCsvCell(value)).join(',')),
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}

const toXlsxBuffer = async (
  reportType: ReportType,
  headers: string[],
  rows: ExportCell[][],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(reportType)

  worksheet.addRow(headers)
  for (const row of rows) {
    worksheet.addRow(row)
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getRow(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

const buildExportFileName = (
  reportType: ReportType,
  format: ReportExportFormat,
): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `atlas-${reportType}-${stamp}.${format}`
}

const fetchAllPortfolioRows = async (
  query: ReportExportQuery,
  scope: ReportsScope,
) => {
  const rows: Awaited<ReturnType<typeof reportsRepository.getPortfolioSummary>>['rows'] = []
  const pageSize = 200
  let page = 1

  while (true) {
    const response = await reportsRepository.getPortfolioSummary(
      {
        search: query.search,
        dateRange: query.dateRange,
        entityType: query.entityType,
        entityId: query.entityId,
        partnershipId: query.partnershipId,
        taxYear: query.taxYear,
        sort: query.sort === undefined ? 'entityName' : query.sort,
        direction: query.direction === undefined ? 'asc' : query.direction,
        page,
        pageSize,
      },
      scope,
    )

    rows.push(...response.rows)
    if (rows.length >= response.page.total || response.rows.length === 0) {
      break
    }
    page += 1
  }

  return rows
}

const fetchAllActivityRows = async (
  query: ReportExportQuery,
  scope: ReportsScope,
) => {
  const rows: Awaited<ReturnType<typeof reportsRepository.getActivityDetail>>['rows'] = []
  const pageSize = 200
  let page = 1

  while (true) {
    const response = await reportsRepository.getActivityDetail(
      {
        search: query.search,
        dateRange: query.dateRange,
        entityType: query.entityType,
        entityId: query.entityId,
        partnershipId: query.partnershipId,
        taxYear: query.taxYear,
        sort: query.sort === undefined ? 'taxYear' : query.sort,
        direction: query.direction === undefined ? 'desc' : query.direction,
        page,
        pageSize,
      },
      scope,
    )

    rows.push(...response.rows)
    if (rows.length >= response.page.total || response.rows.length === 0) {
      break
    }
    page += 1
  }

  return rows
}

const buildPortfolioExportData = async (
  query: ReportExportQuery,
  scope: ReportsScope,
): Promise<TabularExportData> => {
  const rows = await fetchAllPortfolioRows(query, scope)

  return {
    headers: [
      'Entity',
      'Entity Type',
      'Partnership Count',
      'Original Commitment',
      '% Called',
      'Unfunded',
      'Paid-In',
      'Distributions',
      'Residual Value',
      'DPI',
      'RVPI',
      'TVPI',
      'IRR',
    ],
    rows: rows.map((row) => [
      row.entityName,
      row.entityType,
      row.partnershipCount,
      row.originalCommitmentUsd,
      row.calledPct,
      row.unfundedUsd,
      row.paidInUsd,
      row.distributionsUsd,
      row.residualValueUsd,
      row.dpi,
      row.rvpi,
      row.tvpi,
      row.irr,
    ]),
  }
}

const buildAssetClassExportData = async (
  query: ReportExportQuery,
  scope: ReportsScope,
): Promise<TabularExportData> => {
  const response = await reportsRepository.getAssetClassSummary(
    {
      search: query.search,
      dateRange: query.dateRange,
      entityType: query.entityType,
      entityId: query.entityId,
      partnershipId: query.partnershipId,
      taxYear: query.taxYear,
      sort: query.sort === undefined ? 'assetClass' : query.sort,
      direction: query.direction === undefined ? 'asc' : query.direction,
    },
    scope,
  )

  return {
    headers: [
      'Asset Class',
      'Partnership Count',
      'Original Commitment',
      '% Called',
      'Unfunded',
      'Paid-In',
      'Distributions',
      'Residual Value',
      'DPI',
      'RVPI',
      'TVPI',
      'IRR',
    ],
    rows: response.rows.map((row) => [
      row.assetClass,
      row.partnershipCount,
      row.originalCommitmentUsd,
      row.calledPct,
      row.unfundedUsd,
      row.paidInUsd,
      row.distributionsUsd,
      row.residualValueUsd,
      row.dpi,
      row.rvpi,
      row.tvpi,
      row.irr,
    ]),
  }
}

const buildActivityDetailExportData = async (
  query: ReportExportQuery,
  scope: ReportsScope,
): Promise<TabularExportData> => {
  const rows = await fetchAllActivityRows(query, scope)

  return {
    headers: [
      'Tax Year',
      'Entity',
      'Partnership',
      'Beginning Basis',
      'Contributions',
      'Interest',
      'Dividends',
      'Cap Gains',
      'Remaining K-1',
      'Total Income',
      'Distributions',
      'Other Adjustments',
      'Ending Tax Basis',
      'Ending GL Balance',
      'Book-To-Book Adjustment',
      'K-1 Capital Account',
      'K-1 vs Tax Difference',
      'Excess Distribution',
      'Negative Basis',
      'Ending Basis',
      'Notes',
      'Updated At',
    ],
    rows: rows.map((row) => [
      row.taxYear,
      row.entityName,
      row.partnershipName,
      row.beginningBasisUsd,
      row.contributionsUsd,
      row.interestUsd,
      row.dividendsUsd,
      row.capitalGainsUsd,
      row.remainingK1Usd,
      row.totalIncomeUsd,
      row.distributionsUsd,
      row.otherAdjustmentsUsd,
      row.endingTaxBasisUsd,
      row.endingGlBalanceUsd,
      row.bookToBookAdjustmentUsd,
      row.k1CapitalAccountUsd,
      row.k1VsTaxDifferenceUsd,
      row.excessDistributionUsd,
      row.negativeBasis,
      row.endingBasisUsd,
      row.notes,
      row.updatedAt,
    ]),
  }
}

const buildTabularExportData = async (
  query: ReportExportQuery,
  scope: ReportsScope,
): Promise<TabularExportData> => {
  if (query.reportType === 'portfolio_summary') {
    return buildPortfolioExportData(query, scope)
  }

  if (query.reportType === 'asset_class_summary') {
    return buildAssetClassExportData(query, scope)
  }

  return buildActivityDetailExportData(query, scope)
}

export const reportsExport = {
  async generateReportExport(
    query: ReportExportQuery,
    scope: ReportsScope,
  ): Promise<GeneratedReportExport> {
    const tabular = await buildTabularExportData(query, scope)
    const body =
      query.format === 'csv'
        ? toCsvBuffer(tabular.headers, tabular.rows)
        : await toXlsxBuffer(query.reportType, tabular.headers, tabular.rows)

    return {
      fileName: buildExportFileName(query.reportType, query.format),
      contentType: query.format === 'csv' ? CSV_MIME_TYPE : XLSX_MIME_TYPE,
      body,
    }
  },
}
