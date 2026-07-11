import type { TicRegistryResponse } from '../../../../../../packages/types/src/tic-registry'

export const ticRegistryFixture: TicRegistryResponse = {
  properties: [
    {
      id: 'property-1',
      name: 'Harbor View TIC',
      propertyType: 'multifamily',
      status: 'held',
      acquiredDate: '2026-01-15',
      estimatedValueUsd: 1_250_000,
      notes: 'Core registry fixture',
      allocation: {
        allocatedPercentage: 40,
        status: 'under',
        message: '40% allocated; 60% unassigned',
      },
      interests: [
        {
          id: 'interest-1',
          propertyId: 'property-1',
          name: 'Harbor View TIC A',
          propertyPercentage: 40,
          status: 'active',
          acquisitionOrigin: 'cash',
          relinquishedInterestId: null,
          relinquishedSourceName: null,
          relinquishedSourceLabel: null,
          acquisitionDate: '2026-01-15',
          acquisitionValueUsd: 500_000,
          notes: null,
          allocation: {
            allocatedPercentage: 50,
            status: 'under',
            message: '50% allocated; 50% unassigned',
          },
          owners: [
            {
              id: 'owner-1',
              ticInterestId: 'interest-1',
              name: 'Atlas Family Trust',
              ownerType: 'trust',
              ticPercentage: 50,
              effectivePropertyPercentage: 20,
              createdAt: '2026-01-15T00:00:00.000Z',
              updatedAt: '2026-01-15T00:00:00.000Z',
            },
          ],
          createdAt: '2026-01-15T00:00:00.000Z',
          updatedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
  ],
  summary: {
    propertyCount: 1,
    ticInterestCount: 1,
    ownerCount: 1,
    estimatedHeldValueUsd: 1_250_000,
    underAllocatedPropertyCount: 1,
    overAllocatedPropertyCount: 0,
    underAllocatedInterestCount: 1,
    overAllocatedInterestCount: 0,
  },
}

export const emptyTicRegistryFixture: TicRegistryResponse = {
  properties: [],
  summary: {
    propertyCount: 0,
    ticInterestCount: 0,
    ownerCount: 0,
    estimatedHeldValueUsd: 0,
    underAllocatedPropertyCount: 0,
    overAllocatedPropertyCount: 0,
    underAllocatedInterestCount: 0,
    overAllocatedInterestCount: 0,
  },
}

export const readOnlyTicRegistryFixture: TicRegistryResponse = ticRegistryFixture
