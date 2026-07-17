import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PARTNERSHIP_TYPES } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipAggregationFilters } from '../components/aggregation/PartnershipAggregationFilters'
import { PartnershipAggregationKpis } from '../components/aggregation/PartnershipAggregationKpis'
import { PartnershipAggregationTable } from '../components/aggregation/PartnershipAggregationTable'
import { aggregationResponseFixture } from './fixtures'

describe('partnership aggregation responsive structure', () => {
  it('uses a 17rem desktop rail and a 44px mobile drawer trigger', () => {
    const onToggle = vi.fn()
    const facetsWithoutTypeOptions = { ...aggregationResponseFixture.facets, partnershipTypes: [] }
    render(<PartnershipAggregationFilters query={aggregationResponseFixture.query} facets={facetsWithoutTypeOptions} searchValue="" activeCount={0} onSearchChange={vi.fn()} onToggle={onToggle} onClear={vi.fn()} />)
    expect(screen.getByLabelText('Partnership filters').parentElement).toHaveClass('lg:w-[17rem]')
    expect(screen.getByTestId('aggregation-filter-rail')).toHaveClass('h-[calc(100vh-8rem)]', 'overflow-hidden')
    expect(screen.getByTestId('aggregation-filter-scroll')).toHaveClass('min-h-0', 'overflow-y-auto')
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveClass('min-h-11', 'lg:hidden')
    expect(screen.getByText('Partnership type')).toBeInTheDocument()
    for (const partnershipType of PARTNERSHIP_TYPES) expect(screen.getByRole('checkbox', { name: partnershipType })).toBeInTheDocument()
    const privateEquity = screen.getByRole('checkbox', { name: 'Private Equity' })
    expect(privateEquity).toBeInTheDocument()
    fireEvent.click(privateEquity)
    expect(onToggle).toHaveBeenCalledWith('partnershipTypes', 'Private Equity')
  })

  it('wraps KPI coverage and constrains wide-ledger overflow to a sticky-identity table viewport', () => {
    const { container } = render(<MemoryRouter><PartnershipAggregationKpis rollup={aggregationResponseFixture.rollup} /><PartnershipAggregationTable items={aggregationResponseFixture.items} rollup={aggregationResponseFixture.rollup} sort="partnership" direction="asc" pageInfo={aggregationResponseFixture.pageInfo} onSort={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} /></MemoryRouter>)
    expect(screen.getAllByText('3 of 4 partnerships').length).toBeGreaterThan(0)
    expect(screen.getByTestId('aggregation-table-viewport')).toHaveClass('overflow-x-auto', 'max-w-full')
    expect(container.querySelector('th.sticky.left-0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alpha Growth I/ })).toHaveClass('min-h-11')
    expect(container.querySelector('table')).toHaveClass('min-w-[116rem]')
  })
})
