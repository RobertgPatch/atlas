import { render, screen,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { positionFields, type CsvDetail, type CsvField } from '../../../../../../packages/types/src/liquidity-statements'
import { LiquidityCsvReview } from './LiquidityCsvReview'
import { LiquidityCsvApplicationPreview } from './LiquidityCsvApplicationPreview'
import { LiquidityCsvDialog } from './LiquidityCsvDialog'
it('shows processing without suggesting values were published', () => {
  const detail: CsvDetail = { summary: { id: 'import', entityId: 'entity', custodian: 'Synthetic Broker', version: 2, status: 'PARSING', adapterId: null, safeErrorCode: null, uploadedAt: '2026-09-01' }, canonicalDraft: null, reviewRevision: 0, issues: [], accountBindings: [], reconciliations: {}, records: [] }
  render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={vi.fn()}/>)
  expect(screen.getByRole('status')).toHaveTextContent('return to the draft')
  expect(screen.getByRole('button', { name: 'Cancel this upload' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Apply snapshot' })).not.toBeInTheDocument()
})
it('offers an accessible per-holding category dropdown during review', async () => {
  const user = userEvent.setup()
  const field = (value: string | null, reason: string | null = null): CsvField => ({ value, raw: [], origin: 'DERIVED', availability: value == null ? 'UNAVAILABLE' : 'COMPLETE', evidence: [], derivation: null, reason })
  const position = Object.assign({ occurrenceId: 'position-1', sourceRecord: 2 }, Object.fromEntries(positionFields.map(name => [name, field(null)])))
  position.symbol = field('NOTLISTED')
  position.description = field('Unclassified holding')
  position.assetType = field('other', 'DEFAULT_OTHER_ASSET_TYPE')
  position.currency = field('USD')
  position.quantity = field('1')
  position.price = field('10')
  position.marketValue = field('1234.5')
  position.costBasis = field('1247')
  position.unrealizedGainLoss = field('-12.5')
  const detail = {
    summary: { id: 'import', entityId: 'entity', custodian: 'Broker', version: 2, status: 'NEEDS_REVIEW', adapterId: 'merrill_holdings_v1', safeErrorCode: null, uploadedAt: '2026-09-01' },
    canonicalDraft: { schemaVersion: '2.0.0', adapter: { id: 'merrill_holdings_v1', version: '1.2.0' }, sourceHash: 'hash', recordCounts: { total: 2, positions: 1, controls: 0, metadata: 0, headers: 1, blanks: 0, unsupported: 0 }, accounts: [{ occurrenceId: 'account-1', identifierFingerprints: [], displayName: field('Account'), accountMask: field('1234'), currency: field('USD'), asOfDate: field('2026-09-01'), asOfAt: field(null), sourceZone: field('UTC'), asOfPrecision: 'DATE', reportedTotal: field(null), positions: [position] }], issues: [] },
    reviewRevision: 0,
    issues: [{ id: 'basis-mismatch', code: 'TOTAL_MISMATCH', severity: 'BLOCKING', accountOccurrenceId: 'account-1', fieldPath: 'accounts.0.reportedBasis', sourceRecords: [2], acknowledged: false }],
    accountBindings: [],
    reconciliations: { 'account-1': { status: 'NOT_PROVIDED', totalValue: '10', difference: null, basisCoverage: { knownRows: 1, unknownRows: 0, estimatedRows: 0, status: 'COMPLETE', knownSubtotal: '10', total: '10' }, gainCoverage: { knownRows: 1, unknownRows: 0, estimatedRows: 0, status: 'COMPLETE', knownSubtotal: '0', total: '0' }, controls:[{fieldPath:'accounts.0.reportedBasis',originalStatus:'MISMATCH',effectiveStatus:'MISMATCH',reported:'100',originalObserved:'90',effectiveObserved:'90'}] } },
    records: [{ordinal:2,lineStart:2,lineEnd:2,role:'POSITION',cells:['NOTLISTED','1234.5']}],
  } as CsvDetail
  render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={vi.fn()}/>)
  const category = screen.getByLabelText('Category for NOTLISTED')
  expect(screen.getByRole('alert')).toHaveTextContent('Cost-basis control total does not match the CSV footer.')
  expect(screen.getByText('Statement reported total').nextElementSibling).toHaveTextContent('Unavailable')
  expect(screen.getByText('Calculated holdings').nextElementSibling).toHaveTextContent('$10.00')
  expect(screen.getByText('$1,234.50')).toBeInTheDocument()
  expect(screen.getByText('$1,247.00')).toBeInTheDocument()
  expect(screen.getByText('-$12.50')).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Review findings (1)'})).toHaveFocus()
  expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  expect(screen.getAllByText('$90.00').length).toBeGreaterThan(0)
  expect(screen.getAllByText('CSV line 2').length).toBeGreaterThan(0)
  await user.click(screen.getByRole('button',{name:'View source'}))
  await waitFor(()=>expect(screen.getByText('NOTLISTED | 1234.5').closest('tr')).toHaveFocus())
  expect(category).toHaveValue('other')
  await user.selectOptions(category, 'equity')
  expect(category).toHaveValue('equity')
  expect(screen.getByText('1 pending corrections. Save review to recalculate and check them.')).toBeInTheDocument()
})
it('explains historical publication and confirms removals in preview', async () => {
  const apply = vi.fn(), user = userEvent.setup()
  render(<LiquidityCsvApplicationPreview busy={false} onApply={apply} onBack={vi.fn()} preview={{ id: 'p', expectedVersion: 4, summaryHash: 'h', expiresAt: '2026-10-01', canApply: true, accounts: [{ accountId: 'a', asOfDate: '2026-09-01', asOfAt: null, added: 0, changed: 0, removed: 3, previousValue: '1000', nextValue: '0', reconciliation: 'MATCHED', willBecomeCurrent: false, basisCoverage: { knownRows: 0, unknownRows: 0, estimatedRows: 0, status: 'COMPLETE', knownSubtotal: '0', total: '0' },gainCoverage:{knownRows:0,unknownRows:0,estimatedRows:0,status:'COMPLETE',knownSubtotal:'0',total:'0'},controls:[] }] }}/>)
  expect(screen.getByText(/3 removed/)).toBeInTheDocument()
  expect(screen.getByText(/saved in history/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Apply snapshot' })); expect(apply).toHaveBeenCalledOnce()
})
it('supports Escape and returns focus when the dialog closes', async () => {
  const close = vi.fn(), user = userEvent.setup()
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
  const { unmount } = render(<LiquidityCsvDialog title="Upload" onClose={close}><input aria-label="File name"/></LiquidityCsvDialog>)
  expect(screen.getByRole('dialog')).toHaveFocus()
  await user.keyboard('{Escape}'); expect(close).toHaveBeenCalledOnce()
  unmount(); expect(trigger).toHaveFocus(); trigger.remove()
})
