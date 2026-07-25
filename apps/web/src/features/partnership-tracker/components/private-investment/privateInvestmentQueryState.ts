import {
  PARTNERSHIP_TYPES,
  type PartnershipType,
  type PrivateInvestmentQuery,
} from '../../../../../../../packages/types/src/partnership-tracker'

export const DEFAULT_PRIVATE_INVESTMENT_QUERY: PrivateInvestmentQuery = {
  assetClasses: [],
  entityIds: [],
  partnershipIds: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  page: 1,
  pageSize: 50,
}
const list = (params: URLSearchParams, key: string) => [...new Set((params.get(key) ?? '').split(',').map((item) => item.trim()).filter(Boolean))]
const moneyToCents = (value: string): bigint => {
  const [whole, fraction] = value.split('.')
  return BigInt(whole!) * 100n + BigInt(fraction!)
}
export const isPrivateInvestmentMoneyRangeReversed = (
  minimum: string | null,
  maximum: string | null,
): boolean => Boolean(minimum && maximum && moneyToCents(maximum!) < moneyToCents(minimum!))

export const parsePrivateInvestmentSearchParams = (params: URLSearchParams): PrivateInvestmentQuery => {
  const selectedAssetClasses = new Set(list(params, 'assetClasses'))
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('pageSize'))
  return {
    assetClasses: PARTNERSHIP_TYPES.filter((assetClass): assetClass is PartnershipType => selectedAssetClasses.has(assetClass)),
    entityIds: list(params, 'entityIds').sort(),
    partnershipIds: list(params, 'partnershipIds').sort(),
    dateFrom: null,
    dateTo: null,
    amountMin: null,
    amountMax: null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: pageSize === 25 || pageSize === 100 ? pageSize : 50,
  }
}
