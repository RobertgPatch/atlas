import type { EntityListItem } from '../partnerships/api/entitiesClient'
import type {
  PartnershipAssetCategory,
  PartnershipAssetRow,
} from '../../../../../packages/types/src/partnership-management'
import type { PartnershipTrackerSummary } from '../../../../../packages/types/src/partnership-tracker'
import type { EstateRelationshipRecord } from './estateMapStorage'

export interface EstateMapPartnership {
  summary: PartnershipTrackerSummary
  relationships: EstateRelationshipRecord[]
}

export interface EstateMapAssetBranch extends EstateMapPartnership {
  assets: PartnershipAssetRow[]
}

export const ESTATE_ASSET_CATEGORY_ORDER: PartnershipAssetCategory[] = [
  'real_estate',
  'marketable_securities',
  'alternatives',
  'cash_equivalents',
  'other',
]

export const ESTATE_ASSET_CATEGORY_LABELS: Record<PartnershipAssetCategory, string> = {
  real_estate: 'Real Estate',
  marketable_securities: 'Marketable Securities',
  alternatives: 'Alternatives',
  cash_equivalents: 'Cash & Cash Equivalents',
  other: 'Other Assets',
}

export interface EstateAssetCategoryView {
  id: PartnershipAssetCategory
  label: string
  assets: Array<PartnershipAssetRow & { partnershipName: string }>
  totalValue: number
  percentage: number
  valuedAssetCount: number
}

export function selectDefaultRootEntity(entities: EntityListItem[]) {
  return (
    entities.find((entity) => entity.entityType.toLowerCase().includes('trust')) ??
    entities[0]
  )
}

export function deriveEstateMapPartnerships(
  partnerships: PartnershipTrackerSummary[],
  rootEntityId: string,
  estateMapId: string,
  getRelationships: (partnershipId: string) => EstateRelationshipRecord[],
): EstateMapPartnership[] {
  return partnerships
    .map((summary) => ({
      summary,
      relationships: getRelationships(summary.partnership.id).filter(
        (relationship) =>
          relationship.estateMapIds === undefined
            ? relationship.partyId === rootEntityId ||
              summary.partnership.entity.id === rootEntityId
            : relationship.estateMapIds.includes(estateMapId),
      ),
    }))
    .filter((branch) => branch.relationships.length > 0)
    .sort((a, b) => a.summary.partnership.name.localeCompare(b.summary.partnership.name))
}

function numericMoney(value: string | number | null | undefined) {
  if (value == null || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

export function deriveEstateAssetCategories(
  branches: EstateMapAssetBranch[],
): EstateAssetCategoryView[] {
  const allAssets = branches.flatMap((branch) =>
    branch.assets
      .filter((asset) => asset.status === 'ACTIVE')
      .map((asset) => ({
        ...asset,
        partnershipName: branch.summary.partnership.name,
      })),
  )
  const totalValue = allAssets.reduce(
    (total, asset) => total + (numericMoney(asset.latestFmv?.amountUsd) ?? 0),
    0,
  )

  return ESTATE_ASSET_CATEGORY_ORDER.map((id) => {
    const assets = allAssets.filter((asset) => asset.assetCategory === id)
    const categoryValue = assets.reduce(
      (total, asset) => total + (numericMoney(asset.latestFmv?.amountUsd) ?? 0),
      0,
    )
    return {
      id,
      label: ESTATE_ASSET_CATEGORY_LABELS[id],
      assets,
      totalValue: categoryValue,
      percentage: totalValue > 0 ? (categoryValue / totalValue) * 100 : 0,
      valuedAssetCount: assets.filter((asset) => numericMoney(asset.latestFmv?.amountUsd) != null)
        .length,
    }
  }).filter((category) => category.assets.length > 0)
}

/**
 * Uses partnership NAV when it is available and only falls back to the sum of
 * underlying-asset FMVs. This prevents the same economic value from being
 * counted once as NAV and again as its look-through holdings.
 */
export function deriveEstateValue(branches: EstateMapAssetBranch[]) {
  return branches.reduce((total, branch) => {
    const nav = numericMoney(branch.summary.latestNav?.amount)
    if (nav != null) return total + nav
    return total + branch.assets.reduce(
      (assetTotal, asset) =>
        asset.status === 'ACTIVE'
          ? assetTotal + (numericMoney(asset.latestFmv?.amountUsd) ?? 0)
          : assetTotal,
      0,
    )
  }, 0)
}

export function formatEstateMoney(value: string | number | null | undefined) {
  if (value == null || value === '') return 'Not valued'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Not valued'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(amount) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(amount) >= 1_000_000 ? 1 : 0,
  }).format(amount)
}
