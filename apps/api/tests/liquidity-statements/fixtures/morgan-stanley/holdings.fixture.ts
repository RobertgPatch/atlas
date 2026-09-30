import { buildXlsxFixture, type XlsxFixtureCell } from '../../adapter-conformance/fixture-builders.js'

const headers = [
  'Name', 'Product Type', 'Open Order', 'Symbol', 'CUSIP', 'Last ($)', 'As of', 'Quantity',
  'Market Value ($)', "Today's Change (%)", "Today's Change ($)", 'Total Cost ($)',
  'Adjusted Cost ($)', 'Unrealized Gain/Loss (%)', 'Unrealized Gain/Loss ($)', 'Accrued Interest',
] as const

const columnName = (index: number): string => {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

const textRow = (index: number, values: readonly string[]) => ({
  index,
  cells: values.map((value, column): XlsxFixtureCell => ({
    address: `${columnName(column)}${index}`,
    kind: 'inlineString',
    value,
  })),
})

const valueRow = (index: number, values: readonly string[]) => ({
  index,
  cells: values.map((value, column): XlsxFixtureCell => {
    const address = `${columnName(column)}${index}`
    return /^-?(?:\d+\.?\d*|\.\d+)$/u.test(value)
      ? { address, kind: 'number', value }
      : { address, kind: 'inlineString', value }
  }),
})

/** Entirely synthetic Morgan Stanley-shaped workbook. It intentionally keeps
 * the header away from the currently observed row to forbid fixed-row parsing.
 */
export function buildMorganStanleyHoldingsFixture(): Buffer {
  return buildXlsxFixture({ sheets: [{
    name: 'Holdings',
    rows: [
      textRow(1, ['All Product Type By Security']),
      textRow(4, ['Holdings for Account Synthetic Family - 0042 as of 10/15/2026 1:31 PM ET']),
      textRow(7, ['Holding Summary']),
      valueRow(8, ['Total Market Value:', '3280', 'Accrued Interest*:', '10', 'Total Cost:', '2320', 'Adjusted Cost:', '1800']),
      textRow(12, headers),
      valueRow(13, ['SYNTHETIC PUBLIC CO CLASS A', 'Stocks / Options', 'No', 'TST', '000000101', '11', '10/15/2026', '100', '1100', '-1.25', '-13.75', '950', '900', '22.222', '200', '-']),
      valueRow(14, ['ZERO BASIS ASSET', 'Other Holdings', 'No', 'ZBA', '000000202', '5', '10/15/2026', '10', '50', '-', '-', '40', '0', '-', '50', '-']),
      valueRow(15, ['FALLBACK FUND', 'Mutual Funds', 'No', 'FBFXX', '000000303', '10', '10/15/2026', '20', '200', '0', '0', '180', '-', '11.11', '20', '-']),
      valueRow(16, ['INCOMPLETE FUND', 'Mutual Funds', 'No', 'INCXX', '000000404', '10', '10/15/2026', '30', '300', '-', '-', '250', 'Incomplete', '20', '50', '-']),
      valueRow(17, ['PRIVATE HOLDING AT PAR', 'Other Holdings', 'No', 'PVT1', '000000505', '1', '10/15/2026', '100', '100', '-', '-', '-', '-', '-', '-', '-']),
      valueRow(18, ['SYNTHETIC CORPORATE NOTE', 'Corporate Fixed Income', 'No', '-', '000000606', '98', '10/15/2026', '1000', '980', '-', '-', '900', '900', '8.888', '80', '10']),
      valueRow(19, ['BANK DEPOSIT PROGRAM | SYNTHETIC BANK NA', 'Cash, MMF and BDP', 'No', 'BANKNA', '000000707', '-', '-', '-', '500', '-', '-', '-', '-', '-', '-', '0']),
      valueRow(20, ['WESTERN ASSET INST GOV RESV I', 'Mutual Funds', 'No', 'INGXX', '000000808', '1', '10/15/2026', '50', '50', '-', '-', '-', '-', '-', '-', '-']),
      valueRow(21, ['Total', '-', '-', '-', '-', '-', '-', '-', '3280', '-0.42', '-13.75', '2320', '1800', '-', '400', '10']),
      textRow(27, ['Account contains securities for which cost basis and/or other values are not available (indicated by --).']),
    ],
  }] })
}
