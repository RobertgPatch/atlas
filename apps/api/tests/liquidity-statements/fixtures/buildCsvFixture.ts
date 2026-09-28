// Entirely synthetic. Never populate these fixtures from client exports.
export const csvCell = (value: string) => /[",\r\n]/.test(value)
  ? `"${value.replaceAll('"', '""')}"` : value
export const csvRows = (rows: string[][]) => rows.map(row => row.map(csvCell).join(',')).join('\r\n')
export const positionsHeaders = ['Symbol', 'Description', 'Qty (Quantity)', 'Price', 'Mkt Val (Market Value)', 'Cost Basis', 'Gain $ (Gain/Loss $)', 'Gain % (Gain/Loss %)', 'Day Chng $ (Day Change $)', 'Asset Type']
export const merrillHeaders = ['COB Date', 'Security #', 'Symbol', 'CUSIP #', 'Security Description', 'Account Nickname', 'Account Registration', 'Account #', 'Quantity', 'Price ($)', 'Value ($)', 'Unrealized Gain/Loss ($)', 'Unrealized Gain/Loss (%)', 'Cumulative Investment Return ($)', 'Accrued Interest ($)']
export function buildCsvFixture(options: { format?: 'positions' | 'merrill'; rows?: string[][]; date?: string; total?: string } = {}) {
  if (options.format === 'merrill') return csvRows([merrillHeaders, ...(options.rows ?? [[options.date ?? '9/1/2026', '00042', 'DEMO', '001234567', 'Synthetic equity', 'Example', 'Trust', '00012345', '10', '80', '800', '-200', '-20.00', '999', '0']])])
  return csvRows([[`Positions for account Synthetic ...1234 as of ${options.date ?? '09/01/2026'} 04:00 PM ET`], [''], positionsHeaders, ...(options.rows ?? [['DEMO', 'Synthetic, quoted equity', '10', '$80.00', '$800.00', '$1,000.00', '($200.00)', '-20.00%', 'N/A', 'Equity']]), ...(options.total === undefined ? [] : [['Positions Total', '', '', '', options.total, '', '', '', '', '']])])
}
