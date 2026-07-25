import PDFDocument from 'pdfkit'
import type {
  EntityFundPosition,
  PrivateInvestmentActivityRow,
  PrivateInvestmentDetailColumnId,
  PrivateInvestmentPdfRequest,
  PrivateInvestmentSummaryColumnId,
} from './partnership-tracker.contracts.js'
import type { PrivateInvestmentComposition } from './private-investment-tracker.js'

type ReportColumn<Id extends string> = { id: Id; label: string }
export type PrivateInvestmentPdfReportModel = {
  title: string
  brand: string
  orientation: 'landscape'
  generatedAt: string
  asOfDate: string
  filterSummary: string
  summaryScope: string
  summaryColumns: ReportColumn<PrivateInvestmentSummaryColumnId>[]
  detailColumns: ReportColumn<PrivateInvestmentDetailColumnId>[]
  positions: EntityFundPosition[]
  activities: PrivateInvestmentActivityRow[]
}

const summaryLabels: Record<PrivateInvestmentSummaryColumnId, string> = {
  entity: 'Entity',
  fund: 'Fund',
  assetClass: 'Asset Class',
  totalCommitted: 'Total Committed',
  remainingCommitment: 'Remaining Commitment',
  status: 'Status',
  vintageYear: 'Vintage',
  totalInvested: 'Total Invested',
  valuation: 'Valuation',
  dpi: 'DPI',
  tvpi: 'TVPI',
  xirr: 'XIRR',
  simplifiedIrr: 'Simplified IRR',
}
const detailLabels: Record<PrivateInvestmentDetailColumnId, string> = {
  entity: 'Entity',
  fund: 'Fund',
  date: 'Date',
  amount: 'Amount',
  type: 'Type',
  source: 'Source',
}

const titleCaseActivity = (value: PrivateInvestmentActivityRow['type']): string =>
  value.split('_').map((word) => `${word[0]}${word.slice(1).toLowerCase()}`).join(' ')

const accountingMoney = (value: string | null, direction?: PrivateInvestmentActivityRow['displayDirection']): string => {
  if (value == null) return '—'
  const negative = value.startsWith('-')
  const [whole, fraction = '00'] = value.replace(/^-/, '').split('.')
  const groupedWhole = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const formatted = `$${groupedWhole}.${fraction.padEnd(2, '0').slice(0, 2)}`
  return direction === 'OUTFLOW' || negative ? `(${formatted})` : formatted
}
const ratio = (value: string | null): string => value == null
  ? '—'
  : `${(Number(value) * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const multiple = (value: string | null): string => value == null ? '—' : `${Number(value).toFixed(2)}x`

const summaryValue = (row: EntityFundPosition, id: PrivateInvestmentSummaryColumnId): string => {
  switch (id) {
    case 'entity': return row.entity.name
    case 'fund': return row.partnership.name
    case 'assetClass': return row.assetClass
    case 'totalCommitted': return accountingMoney(row.totalCommitted?.amount ?? null)
    case 'remainingCommitment': return accountingMoney(row.remainingCommitment)
    case 'status': return row.status
    case 'vintageYear': return row.vintageYear?.toString() ?? '—'
    case 'totalInvested': return accountingMoney(row.totalInvested, 'OUTFLOW')
    case 'valuation': return row.latestValuation == null
      ? '—'
      : `${accountingMoney(row.latestValuation.amount)}\n${row.latestValuation.date}`
    case 'dpi': return multiple(row.dpi)
    case 'tvpi': return multiple(row.tvpi)
    case 'xirr': return ratio(row.xirr)
    case 'simplifiedIrr': return ratio(row.simplifiedIrr)
  }
}
const detailValue = (row: PrivateInvestmentActivityRow, id: PrivateInvestmentDetailColumnId): string => {
  switch (id) {
    case 'entity': return row.entity.name
    case 'fund': return row.partnership.name
    case 'date': return row.date
    case 'amount': return accountingMoney(row.amount, row.displayDirection)
    case 'type': return titleCaseActivity(row.type)
    case 'source': return row.sourceKind === 'NET_CASH_ACTIVITY' ? 'Cash Activity' : 'FMV'
  }
}

const humanFilterSummary = (report: PrivateInvestmentComposition): string => {
  const filters: string[] = []
  if (report.query.assetClasses.length) filters.push(`Asset classes: ${report.query.assetClasses.join(', ')}`)
  if (report.query.entityIds.length) {
    const names = report.facets.entities.filter((item) => report.query.entityIds.includes(item.value)).map((item) => item.label)
    filters.push(`Entities: ${names.join(', ')}`)
  }
  if (report.query.partnershipIds.length) {
    const names = report.facets.partnerships.filter((item) => report.query.partnershipIds.includes(item.value)).map((item) => `${item.label} (${item.entityName})`)
    filters.push(`Funds: ${names.join(', ')}`)
  }
  if (report.query.dateFrom || report.query.dateTo) filters.push(`Date: ${report.query.dateFrom ?? 'any'} to ${report.query.dateTo ?? 'any'}`)
  if (report.query.amountMin || report.query.amountMax) filters.push(`Amount: ${report.query.amountMin ?? '0.00'} to ${report.query.amountMax ?? 'any'}`)
  return filters.length ? filters.join(' • ') : 'All authorized operational activity'
}

export const buildPrivateInvestmentPdfReportModel = (
  report: PrivateInvestmentComposition,
  request: PrivateInvestmentPdfRequest,
  generatedAt = new Date().toISOString(),
): PrivateInvestmentPdfReportModel => ({
  title: 'Investment Tracker',
  brand: 'JACKSON',
  orientation: 'landscape',
  generatedAt,
  asOfDate: report.asOfDate,
  filterSummary: humanFilterSummary(report),
  summaryScope: 'Lifetime metrics for positions represented by the filtered activity ledger.',
  summaryColumns: request.summaryColumns.map((id) => ({ id, label: summaryLabels[id] })),
  detailColumns: request.detailColumns.map((id) => ({ id, label: detailLabels[id] })),
  positions: report.positions,
  activities: report.allMatchingActivities,
})

const chunks = <T>(values: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

const renderTable = <Row, Id extends string>(
  doc: PDFKit.PDFDocument,
  title: string,
  columns: ReportColumn<Id>[],
  rows: Row[],
  value: (row: Row, id: Id) => string,
) => {
  const margin = 36
  const pageWidth = doc.page.width - margin * 2
  const rowHeight = 30
  const headerHeight = 28
  const columnWidth = pageWidth / columns.length
  const drawHeader = () => {
    const y = doc.y
    doc.save().rect(margin, y, pageWidth, headerHeight).fill('#315E9E').restore()
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
    columns.forEach((column, index) => {
      doc.text(column.label, margin + index * columnWidth + 4, y + 7, {
        width: columnWidth - 8,
        height: headerHeight - 8,
        ellipsis: true,
      })
    })
    doc.y = y + headerHeight
  }
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text(title, margin, doc.y)
  doc.moveDown(0.45)
  drawHeader()
  if (!rows.length) {
    doc.fillColor('#667085').font('Helvetica').fontSize(9).text('No matching rows.', margin + 4, doc.y + 10)
    doc.y += rowHeight
    return
  }
  rows.forEach((row, rowIndex) => {
    if (doc.y + rowHeight > doc.page.height - 42) {
      doc.addPage()
      drawHeader()
    }
    const y = doc.y
    if (rowIndex % 2 === 0) doc.save().rect(margin, y, pageWidth, rowHeight).fill('#EEF4FB').restore()
    doc.fillColor('#1F2937').font('Helvetica').fontSize(7)
    columns.forEach((column, index) => {
      doc.text(value(row, column.id), margin + index * columnWidth + 4, y + 6, {
        width: columnWidth - 8,
        height: rowHeight - 8,
        ellipsis: true,
      })
    })
    doc.y = y + rowHeight
  })
}

export const renderPrivateInvestmentPdf = async (model: PrivateInvestmentPdfReportModel): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'LETTER', layout: model.orientation, margin: 36, bufferPages: true, compress: true })
  const buffers: Buffer[] = []
  doc.on('data', (buffer: Buffer) => buffers.push(buffer))
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)
  })

  doc.fillColor('#B58A45').font('Helvetica-Bold').fontSize(10).text(model.brand, 36, 30, { characterSpacing: 2 })
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(23).text(model.title, 36, 48)
  doc.fillColor('#667085').font('Helvetica').fontSize(8)
    .text(`As of ${model.asOfDate}  •  Generated ${model.generatedAt.slice(0, 19).replace('T', ' ')} UTC`, 36, 80)
    .text(model.filterSummary, 36, 94, { width: doc.page.width - 72 })
    .text(model.summaryScope, 36, 108, { width: doc.page.width - 72 })
  doc.y = 132

  chunks(model.summaryColumns, 11).forEach((columns, index) => {
    if (index > 0) doc.addPage()
    renderTable(doc, index === 0 ? 'Investment Summary' : `Investment Summary — columns continued (${index + 1})`, columns, model.positions, summaryValue)
  })
  chunks(model.detailColumns, 6).forEach((columns, index) => {
    doc.addPage()
    renderTable(doc, index === 0 ? 'Cash Flow & Valuation Detail' : `Cash Flow & Valuation Detail — columns continued (${index + 1})`, columns, model.activities, detailValue)
  })

  const range = doc.bufferedPageRange()
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex)
    doc.fillColor('#667085').font('Helvetica').fontSize(7)
      .text(`Jackson Investment Tracker  •  Page ${pageIndex + 1} of ${range.count}`, 36, doc.page.height - 25, {
        width: doc.page.width - 72,
        align: 'right',
      })
  }
  doc.end()
  return complete
}
