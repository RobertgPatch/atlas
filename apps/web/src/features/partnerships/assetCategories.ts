import type {
  PartnershipAssetCategory,
  PartnershipAssetRow,
} from '../../../../../packages/types/src/partnership-management'

export interface AssetCategoryDefinition {
  id: PartnershipAssetCategory
  label: string
  mapLabel: string
  description: string
  detailLabel: string
  detailPlaceholder: string
  defaultAssetType: string
  assetTypes: string[]
}

export const ASSET_CATEGORY_DEFINITIONS: AssetCategoryDefinition[] = [
  {
    id: 'real_estate',
    label: 'Real estate',
    mapLabel: 'Real Estate',
    description: 'Homes, land, and directly owned commercial property.',
    detailLabel: 'Map location',
    detailPlaceholder: 'Palm Beach, FL',
    defaultAssetType: 'Residential property',
    assetTypes: ['Residential property', 'Commercial property', 'Land', 'Farm or ranch', 'Other real estate'],
  },
  {
    id: 'marketable_securities',
    label: 'Marketable securities',
    mapLabel: 'Marketable Securities',
    description: 'Brokerage, custody, and separately managed public portfolios.',
    detailLabel: 'Institution / account detail',
    detailPlaceholder: 'JPMorgan · ending 2486',
    defaultAssetType: 'Brokerage account',
    assetTypes: ['Brokerage account', 'Custody account', 'Separately managed account', 'Public equity', 'Public fixed income', 'Other marketable securities'],
  },
  {
    id: 'alternatives',
    label: 'Alternatives',
    mapLabel: 'Alternatives',
    description: 'Private funds, direct investments, credit, and real assets.',
    detailLabel: 'Strategy / manager',
    detailPlaceholder: 'Private equity · Whitman Capital',
    defaultAssetType: 'Private equity fund',
    assetTypes: ['Private equity fund', 'Venture capital fund', 'Private credit fund', 'Hedge fund', 'Infrastructure fund', 'Real assets fund', 'Direct investment', 'Co-investment', 'Other alternative'],
  },
  {
    id: 'cash_equivalents',
    label: 'Cash & equivalents',
    mapLabel: 'Cash & Cash Equivalents',
    description: 'Bank accounts, money market funds, and short-term Treasuries.',
    detailLabel: 'Institution / maturity',
    detailPlaceholder: 'Operating account · ending 1042',
    defaultAssetType: 'Bank account',
    assetTypes: ['Bank account', 'Money market fund', 'Treasury bills', 'Certificate of deposit', 'Other cash equivalent'],
  },
  {
    id: 'other',
    label: 'Other assets',
    mapLabel: 'Other Assets',
    description: 'Insurance, art, collectibles, vehicles, and other property.',
    detailLabel: 'Map detail',
    detailPlaceholder: 'Policy cash value',
    defaultAssetType: 'Life insurance',
    assetTypes: ['Life insurance', 'Art and collectibles', 'Vehicle', 'Aircraft or watercraft', 'Intellectual property', 'Personal property', 'Other asset'],
  },
]

export const ASSET_CATEGORY_BY_ID = new Map(
  ASSET_CATEGORY_DEFINITIONS.map((category) => [category.id, category]),
)

export function inferAssetCategory(assetType: string): PartnershipAssetCategory {
  const normalized = assetType.trim().toLowerCase()
  if (normalized.includes('real estate') || normalized.includes('property') || normalized === 'land') return 'real_estate'
  if (normalized.includes('brokerage') || normalized.includes('marketable') || normalized.includes('public equity') || normalized.includes('public fixed')) return 'marketable_securities'
  if (['private equity', 'hedge fund', 'venture capital', 'credit', 'infrastructure', 'alternative'].some((value) => normalized.includes(value))) return 'alternatives'
  if (['cash', 'money market', 'treasury', 'certificate of deposit', 'bank account'].some((value) => normalized.includes(value))) return 'cash_equivalents'
  return 'other'
}

export function categoryForAsset(asset: Pick<PartnershipAssetRow, 'assetCategory' | 'assetType'>) {
  return asset.assetCategory ?? inferAssetCategory(asset.assetType)
}
