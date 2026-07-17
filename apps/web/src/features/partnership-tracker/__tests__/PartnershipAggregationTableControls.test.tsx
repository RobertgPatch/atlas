import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PartnershipAggregationKpis } from '../components/aggregation/PartnershipAggregationKpis'
import { PartnershipAggregationTable } from '../components/aggregation/PartnershipAggregationTable'
import { partnershipLedgerColumns } from '../components/aggregation/partnershipAggregationColumns'
import { aggregationResponseFixture } from './fixtures'

function renderTable() {
  return render(
    <MemoryRouter>
      <PartnershipAggregationTable
        items={aggregationResponseFixture.items}
        rollup={aggregationResponseFixture.rollup}
        sort="partnership"
        direction="asc"
        pageInfo={aggregationResponseFixture.pageInfo}
        onSort={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    </MemoryRouter>,
  )
}

function dispatchPointerEvent(target: EventTarget, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'clientX', { value: clientX })
  fireEvent(target, event)
}

describe('PartnershipAggregationTable controls', () => {
  afterEach(() => vi.restoreAllMocks())

  it('resizes a column with pointer and keyboard controls', () => {
    renderTable()
    const partnershipColumn = screen.getByTestId('aggregation-column-partnership')
    const resizeHandle = screen.getByRole('button', { name: 'Resize Partnership column' })

    expect(partnershipColumn).toHaveStyle({ width: '240px' })
    dispatchPointerEvent(resizeHandle, 'pointerdown', 100)
    dispatchPointerEvent(window, 'pointermove', 180)
    dispatchPointerEvent(window, 'pointerup', 180)
    expect(partnershipColumn).toHaveStyle({ width: '320px' })

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' })
    expect(partnershipColumn).toHaveStyle({ width: '304px' })
  })

  it('exports every visible row and the filtered rollup while honoring selected PDF columns', async () => {
    const write = vi.fn()
    const printWindow = {
      document: { write, close: vi.fn(), readyState: 'loading' },
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn(),
    }
    const open = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window)
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    const dialog = screen.getByRole('dialog', { name: 'Export visible partnerships' })
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(partnershipLedgerColumns.length)
    expect(within(dialog).getByRole('checkbox', { name: 'Owner' })).toBeChecked()
    for (const label of ['Lifecycle', 'K-1 workflow', 'Warnings', 'Quality']) {
      expect(within(dialog).getByRole('checkbox', { name: label })).not.toBeChecked()
    }

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Owner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Export visible partnerships' })).not.toBeInTheDocument())

    expect(open).toHaveBeenCalledOnce()
    const html = write.mock.calls[0]?.[0] as string
    expect(html).toContain('Filtered portfolio rollup')
    expect(html).toContain('$350,000')
    expect(html).toContain('0.21×')
    expect(html).toContain('1.36×')
    expect(html).toContain('3 of 4 partnerships')
    expect(html).toContain('4 visible partnerships')
    expect(html).toContain('Alpha Growth I')
    expect(html).toContain('Redwood Fund')
    expect(html).toContain('$0')
    expect(html).toContain('0.25×')
    expect(html).not.toContain('No distribution data')
    expect(html).not.toContain('<th>Owner</th>')
    expect(html).not.toContain('<th>Lifecycle</th>')
    expect(html).not.toContain('<th>K-1 workflow</th>')
    expect(html).not.toContain('<th>Warnings</th>')
    expect(html).not.toContain('<th>Quality</th>')
    expect(html).toContain('overflow-wrap: anywhere')
    expect(html).toContain('white-space: normal')
    expect(html).not.toContain('Alder Family')
  })

  it('shows a zero distribution total when the filtered rollup has no reported distributions', () => {
    render(
      <PartnershipAggregationKpis
        rollup={{
          ...aggregationResponseFixture.rollup,
          distributions: { amount: null, knownCount: 0, totalCount: 4 },
        }}
      />,
    )

    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('0 of 4 partnerships')).toBeInTheDocument()
  })
})
