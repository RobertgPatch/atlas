import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PARTNERSHIP_TYPES } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipAggregationFilters } from '../components/aggregation/PartnershipAggregationFilters'
import { PartnershipAggregationKpis } from '../components/aggregation/PartnershipAggregationKpis'
import { PartnershipAggregationTable } from '../components/aggregation/PartnershipAggregationTable'
import { aggregationResponseFixture } from './fixtures'

describe('partnership aggregation responsive structure', () => {
  it('uses a responsive top filter grid with multiselect autocomplete controls', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    const facetsWithoutTypeOptions = { ...aggregationResponseFixture.facets, partnershipTypes: [] }
    const { container } = render(<PartnershipAggregationFilters query={aggregationResponseFixture.query} facets={facetsWithoutTypeOptions} searchValue="" activeCount={0} onSearchChange={vi.fn()} onFilterChange={onFilterChange} onClear={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Filter partnerships' })).toBeInTheDocument()
    expect(container.querySelector('[class*="2xl:grid-cols-6"]')).toBeInTheDocument()
    for (const label of ['Owner', 'Partnership type', 'Lifecycle', 'K-1 workflow', 'Data quality']) {
      expect(screen.getByLabelText(`${label} filter`)).toHaveClass('h-11')
    }
    await user.click(screen.getByRole('button', { name: 'Open Partnership type filter' }))
    for (const partnershipType of PARTNERSHIP_TYPES) expect(screen.getByRole('option', { name: new RegExp(partnershipType) })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Private Equity/ }))
    expect(onFilterChange).toHaveBeenCalledWith('partnershipTypes', ['Private Equity'])
  })

  it('wraps KPI coverage and constrains wide-ledger overflow to a sticky-identity table viewport', () => {
    const { container } = render(<MemoryRouter><PartnershipAggregationKpis rollup={aggregationResponseFixture.rollup} /><PartnershipAggregationTable items={aggregationResponseFixture.items} rollup={aggregationResponseFixture.rollup} sort="partnership" direction="asc" pageInfo={aggregationResponseFixture.pageInfo} onSort={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} /></MemoryRouter>)
    expect(screen.getAllByText('3 of 4 owner records').length).toBeGreaterThan(0)
    expect(screen.getByTestId('aggregation-table-viewport')).toHaveClass('overflow-x-auto', 'max-w-full')
    expect(container.querySelector('th.sticky.left-0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alpha Growth I/ })).toHaveClass('min-h-11')
    expect(container.querySelector('table')).toHaveClass('min-w-[116rem]')
  })
})
