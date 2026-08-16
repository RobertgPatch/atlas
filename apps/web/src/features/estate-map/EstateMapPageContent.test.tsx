import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstateMapPageContent } from './EstateMapPageContent'
import { savePartnershipRelationships } from './estateMapStorage'

vi.mock('@tanstack/react-query', () => ({
  useQueries: () => [
    {
      data: {
        rows: [
          {
            id: 'asset-1',
            partnershipId: 'partnership-1',
            name: 'Park Avenue Residence',
            assetType: 'Real Estate',
            sourceType: 'manual',
            status: 'ACTIVE',
            description: null,
            notes: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            latestFmv: {
              amountUsd: 85000000,
              valuationDate: '2026-01-01',
              source: 'manual',
              confidenceLabel: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    },
  ],
}))

vi.mock('../partnerships/hooks/useEntityQueries', () => ({
  useEntityList: () => ({
    data: {
      items: [
        {
          id: 'trust-1',
          name: 'Jackson Main Trust',
          entityType: 'TRUST',
          jurisdiction: 'Nevada',
          taxId: null,
          formedOn: null,
          status: 'ACTIVE',
          notes: null,
          registeredAgent: null,
          primaryContact: null,
          ownerCount: 2,
          partnershipCount: 1,
          investmentCount: 1,
          holdingsValueUsd: 85000000,
          totalDistributionsUsd: 0,
        },
        {
          id: 'trust-2',
          name: 'Jackson Dynasty Trust',
          entityType: 'TRUST',
          jurisdiction: 'Delaware',
          taxId: null,
          formedOn: null,
          status: 'ACTIVE',
          notes: null,
          registeredAgent: null,
          primaryContact: null,
          ownerCount: 1,
          partnershipCount: 0,
          investmentCount: 0,
          holdingsValueUsd: 0,
          totalDistributionsUsd: 0,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../partnership-tracker/hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({
    data: {
      items: [
        {
          partnership: {
            id: 'partnership-1',
            entity: { id: 'holding-1', name: 'Jackson Holdings LLC' },
            name: 'Jackson Real Estate Partners',
            partnershipType: 'Real Estate',
            status: 'ACTIVE',
          },
          latestNav: { amount: '85000000', date: '2026-01-01' },
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

describe('EstateMapPageContent', () => {
  beforeEach(() => {
    window.localStorage.clear()
    savePartnershipRelationships('partnership-1', [
      {
        id: 'relationship-1',
        partyId: 'trust-1',
        partyName: 'Jackson Main Trust',
        kind: 'ownership',
        ownershipPercent: 100,
        effectiveDate: '2026-01-01',
      },
    ])
  })

  it('creates the main trust map and renders live partnership and asset records', async () => {
    render(<MemoryRouter><EstateMapPageContent /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Estate Maps' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Main Trust Estate Map')).toBeTruthy())
    expect(screen.getByText('Jackson Main Trust')).toBeTruthy()
    expect(screen.getByText('Jackson Real Estate Partners')).toBeTruthy()
    expect(screen.getByText('Park Avenue Residence')).toBeTruthy()
    expect(screen.getByText('Ownership 100.00%')).toBeTruthy()
  })

  it('creates an additional focused map for another trust', async () => {
    render(<MemoryRouter><EstateMapPageContent /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Main Trust Estate Map')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'New map' }))
    fireEvent.change(screen.getByRole('textbox', { name: /map name/i }), {
      target: { value: 'Dynasty Trust Map' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /main trust \/ owner/i }), {
      target: { value: 'trust-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create map' }))

    expect(await screen.findByText('Dynasty Trust Map')).toBeTruthy()
    expect(screen.getByText('Jackson Dynasty Trust')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'No linked partnerships on this map' })).toBeTruthy()
  })
})
