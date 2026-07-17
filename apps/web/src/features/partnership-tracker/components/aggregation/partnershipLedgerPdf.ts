import type { PartnershipAggregateGroup, PartnershipPortfolioRollup } from '../../../../../../../packages/types/src/partnership-tracker'
import { formatLedgerDate } from './aggregationFormatters'
import { partnershipLedgerExportValue, type PartnershipLedgerColumn } from './partnershipAggregationColumns'
import { partnershipRollupMetrics } from './partnershipAggregationRollup'

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export function createPartnershipLedgerPrintDocument(
  rows: PartnershipAggregateGroup[],
  columns: readonly PartnershipLedgerColumn[],
  rollup: PartnershipPortfolioRollup,
) {
  const headerCells = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')
  const bodyRows = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(partnershipLedgerExportValue(row, column.id))}</td>`).join('')}</tr>`).join('')
  const generatedAt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  const rollupMetricCards = partnershipRollupMetrics(rollup).map((metric) => `
      <div class="rollup-metric">
        <dt>${escapeHtml(metric.label)}</dt>
        <dd class="rollup-value">${escapeHtml(metric.value ?? '-')}</dd>
        <dd class="rollup-detail">${escapeHtml(metric.detail)}</dd>
      </div>`).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>All Partnerships</title><style>
    @page { size: landscape; margin: 0.45in; }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, sans-serif; font-size: 8pt; margin: 0; }
    h1 { font-family: Georgia, serif; font-size: 18pt; margin: 0; }
    h2 { font-family: Georgia, serif; font-size: 14pt; margin: 0; }
    p { color: #4b5563; margin: 6pt 0 16pt; }
    .rollup { border: 1px solid #d1d5db; margin: 0 0 18pt; }
    .rollup-header { align-items: center; background: #030712; color: #ffffff; display: flex; justify-content: space-between; padding: 10pt 12pt; }
    .rollup-as-of { color: #9ca3af; font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; }
    .rollup-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin: 0; }
    .rollup-metric { border-right: 1px solid #e5e7eb; min-height: 68pt; padding: 10pt 8pt; }
    .rollup-metric:last-child { border-right: 0; }
    .rollup-metric dt { color: #6b7280; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .rollup-metric dd { margin-left: 0; }
    .rollup-value { color: #111827; font-family: Georgia, serif; font-size: 12pt; font-weight: 700; margin-bottom: 5pt; margin-top: 9pt; white-space: nowrap; }
    .rollup-detail { color: #6b7280; font-size: 6.5pt; margin-top: 0; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th { background: #f3f4f6; border-bottom: 1px solid #9ca3af; font-size: 7pt; letter-spacing: 0.04em; overflow-wrap: anywhere; padding: 6pt 4pt; text-align: left; text-transform: uppercase; white-space: normal; }
    td { border-bottom: 1px solid #e5e7eb; overflow-wrap: anywhere; padding: 5pt 4pt; vertical-align: top; }
    tr { break-inside: avoid; }
  </style></head><body>
    <section class="rollup">
      <div class="rollup-header"><h2>Filtered portfolio rollup</h2><span class="rollup-as-of">As of ${escapeHtml(formatLedgerDate(rollup.asOfDate) ?? 'Not available')}</span></div>
      <dl class="rollup-grid">${rollupMetricCards}</dl>
    </section>
    <h1>All Partnerships</h1><p>${rows.length} visible ${rows.length === 1 ? 'partnership' : 'partnerships'} | Generated ${escapeHtml(generatedAt)}</p>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`
}

export function openPartnershipLedgerPdf(
  rows: PartnershipAggregateGroup[],
  columns: readonly PartnershipLedgerColumn[],
  rollup: PartnershipPortfolioRollup,
) {
  const printWindow = window.open('', '_blank', 'popup=yes,width=1200,height=800')
  if (!printWindow) return false

  printWindow.document.write(createPartnershipLedgerPrintDocument(rows, columns, rollup))
  printWindow.document.close()
  const print = () => {
    printWindow.focus()
    printWindow.print()
  }

  if (printWindow.document.readyState === 'complete') window.setTimeout(print, 0)
  else printWindow.addEventListener('load', print, { once: true })
  return true
}
