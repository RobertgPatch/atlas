import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PrivateInvestmentFilters } from '../components/private-investment/PrivateInvestmentFilters'
import { PrivateInvestmentPdfExportDialog } from '../components/private-investment/PrivateInvestmentPdfExportDialog'
import { privateInvestmentResponseFixture } from './fixtures'

describe('Private Investment Tracker accessibility', () => {
  it('provides only the three labeled autocomplete filters and a live filter count', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(
      <PrivateInvestmentFilters
        query={privateInvestmentResponseFixture.query}
        facets={privateInvestmentResponseFixture.facets}
        onChange={onChange}
      />,
    )

    for (const name of ['Asset class filter', 'Entity filter', 'Fund filter']) {
      expect(screen.getByLabelText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Showing full permitted portfolio')).toHaveAttribute('aria-live', 'polite')
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0)
    expect(container.querySelectorAll('input[inputmode="decimal"]')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Open Asset class filter' }))
    await user.click(screen.getByText('Real Estate'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ assetClasses: ['Real Estate'], page: 1 }))
  })

  it('clears selected asset class, entity, and fund filters together', () => {
    const onChange = vi.fn()
    render(
      <PrivateInvestmentFilters
        query={{ ...privateInvestmentResponseFixture.query, assetClasses: ['Real Estate'], entityIds: ['e-1'], partnershipIds: ['p-1'] }}
        facets={privateInvestmentResponseFixture.facets}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeEnabled()
    screen.getByRole('button', { name: 'Clear all' }).click()
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ assetClasses: [], entityIds: [], partnershipIds: [] }))
  })

  it('limits fund choices to the selected entity and limits the other dropdowns to the selected fund', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const facets = {
      assetClasses: [
        { value: 'Real Estate' as const, label: 'Real Estate', count: 3 },
        { value: 'Credit' as const, label: 'Credit', count: 2 },
      ],
      entities: [
        { value: 'e-1', label: 'Jackson Family Trust', count: 3 },
        { value: 'e-2', label: 'Gardner Trust', count: 2 },
      ],
      partnerships: [
        { value: 'p-1', label: 'Redwood Fund', count: 3, entityId: 'e-1', entityName: 'Jackson Family Trust', assetClass: 'Real Estate' as const },
        { value: 'p-2', label: 'Credit Opportunities', count: 2, entityId: 'e-2', entityName: 'Gardner Trust', assetClass: 'Credit' as const },
      ],
    }
    const { rerender } = render(
      <PrivateInvestmentFilters
        query={privateInvestmentResponseFixture.query}
        facets={facets}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Entity filter' }))
    await user.click(screen.getByText('Jackson Family Trust'))
    const entityQuery = onChange.mock.calls.at(-1)?.[0]
    rerender(<PrivateInvestmentFilters query={entityQuery} facets={facets} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Open Fund filter' }))
    expect(screen.getByText('Redwood Fund')).toBeInTheDocument()
    expect(screen.queryByText('Credit Opportunities')).not.toBeInTheDocument()

    await user.click(screen.getByText('Redwood Fund'))
    const fundQuery = onChange.mock.calls.at(-1)?.[0]
    rerender(<PrivateInvestmentFilters query={fundQuery} facets={facets} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Open Asset class filter' }))
    expect(screen.getByText('Real Estate')).toBeInTheDocument()
    expect(screen.queryByText('Credit')).not.toBeInTheDocument()
  })

  it('uses a focus-managed dialog with sticky, disabled-safe actions', () => {
    render(
      <PrivateInvestmentPdfExportDialog
        open
        exporting={false}
        error={null}
        onClose={vi.fn()}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('data-headlessui-state', 'open')
    expect(screen.getByRole('button', { name: 'Close PDF export' })).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByRole('button', { name: 'Cancel' }).parentElement).toHaveClass('sticky')
    expect(document.querySelector('.motion-reduce\\:transition-none')).toBeInTheDocument()
  })
})
