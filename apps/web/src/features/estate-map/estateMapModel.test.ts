import { beforeEach, describe, expect, it } from 'vitest'
import type { PartnershipTrackerSummary } from '../../../../../packages/types/src/partnership-tracker'
import type { EntityListItem } from '../partnerships/api/entitiesClient'
import {
  deriveEstateMapPartnerships,
  estateMapSourceHref,
  formatEstateMoney,
  selectDefaultRootEntity,
} from './estateMapModel'
import {
  loadEstateMaps,
  loadPartnershipRelationships,
  saveEstateMaps,
  savePartnershipRelationships,
  type EstateMapDefinition,
} from './estateMapStorage'

const summary = (id: string, name: string) =>
  ({ partnership: { id, name, entity: { id: `holding-${id}`, name: `${name} owner` } } }) as unknown as PartnershipTrackerSummary

describe('estate map derivation', () => {
  beforeEach(() => window.localStorage.clear())

  it('prefers a trust as the main map root', () => {
    const entities = [
      { id: 'owner-1', name: 'Family Office LLC', entityType: 'LLC' },
      { id: 'trust-1', name: 'Jackson Main Trust', entityType: 'TRUST' },
    ] as EntityListItem[]

    expect(selectDefaultRootEntity(entities)?.id).toBe('trust-1')
  })

  it('includes only partnerships connected to the root and assigned to the active map', () => {
    savePartnershipRelationships('partnership-a', [
      {
        id: 'relationship-a',
        partyId: 'trust-1',
        partyName: 'Jackson Main Trust',
        kind: 'ownership',
        ownershipPercent: 75,
        effectiveDate: '2026-01-01',
        estateMapIds: ['map-main'],
      },
    ])
    savePartnershipRelationships('partnership-b', [
      {
        id: 'relationship-b',
        partyId: 'trust-2',
        partyName: 'Jackson Dynasty Trust',
        kind: 'control',
        controlRole: 'Trustee',
        effectiveDate: '2026-01-01',
      },
    ])
    savePartnershipRelationships('partnership-c', [
      {
        id: 'relationship-c',
        partyId: 'trust-1',
        partyName: 'Jackson Main Trust',
        kind: 'ownership',
        ownershipPercent: 25,
        effectiveDate: '2026-01-01',
        estateMapIds: ['map-private-assets'],
      },
    ])

    const branches = deriveEstateMapPartnerships(
      [
        summary('partnership-c', 'Private Assets LP'),
        summary('partnership-a', 'Core Holdings LP'),
        summary('partnership-b', 'Dynasty Holdings LP'),
      ],
      'trust-1',
      'map-main',
      loadPartnershipRelationships,
    )

    expect(branches.map((branch) => branch.summary.partnership.id)).toEqual(['partnership-a'])
    expect(branches[0]?.relationships[0]?.ownershipPercent).toBe(75)
  })

  it('keeps legacy unassigned relationships visible on every map for their owner', () => {
    savePartnershipRelationships('partnership-a', [
      {
        id: 'relationship-a',
        partyId: 'trust-1',
        partyName: 'Jackson Main Trust',
        kind: 'control',
        controlRole: 'Manager',
        effectiveDate: '2026-01-01',
      },
    ])

    expect(
      deriveEstateMapPartnerships(
        [summary('partnership-a', 'Core Holdings LP')],
        'trust-1',
        'any-map',
        loadPartnershipRelationships,
      ),
    ).toHaveLength(1)
  })

  it('shows a partnership on a holding-entity map when that entity has relationships', () => {
    savePartnershipRelationships('partnership-a', [
      {
        id: 'relationship-a',
        partyId: 'person-1',
        partyName: 'Jane Jackson',
        kind: 'ownership',
        ownershipPercent: 100,
        effectiveDate: '2026-01-01',
      },
    ])

    expect(
      deriveEstateMapPartnerships(
        [summary('partnership-a', 'Core Holdings LP')],
        'holding-partnership-a',
        'map-main-trust',
        loadPartnershipRelationships,
      ),
    ).toHaveLength(1)
  })

  it('persists multiple independently managed maps', () => {
    const maps: EstateMapDefinition[] = [
      {
        id: 'map-main',
        name: 'Main Trust Estate Map',
        rootEntityId: 'trust-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'map-dynasty',
        name: 'Dynasty Trust Estate Map',
        rootEntityId: 'trust-2',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]

    saveEstateMaps(maps)
    expect(loadEstateMaps()).toEqual(maps)
  })

  it('formats recorded valuations for compact map nodes', () => {
    expect(formatEstateMoney('1420000000')).toBe('$1.4B')
    expect(formatEstateMoney(null)).toBe('Not valued')
  })

  it('builds canonical entity, partnership, and underlying-asset source links', () => {
    expect(estateMapSourceHref({ kind: 'root', entityId: 'trust/1' })).toBe('/entities/trust%2F1')
    expect(estateMapSourceHref({ kind: 'partnership', partnershipId: 'partnership-1' })).toBe(
      '/investment-tracker?partnership=partnership-1',
    )
    expect(estateMapSourceHref({ kind: 'asset', partnershipId: 'partnership-1' })).toBe(
      '/investment-tracker?partnership=partnership-1&area=underlying-assets',
    )
  })
})
