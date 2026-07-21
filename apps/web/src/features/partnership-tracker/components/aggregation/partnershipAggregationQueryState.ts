import {
  PARTNERSHIP_AGGREGATION_SORTS,
  PARTNERSHIP_AGGREGATION_WORKFLOWS,
  PARTNERSHIP_DATA_QUALITIES,
  PARTNERSHIP_TYPES,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type {
  PartnershipAggregationPageSize,
  PartnershipAggregationQuery,
  PartnershipAggregationSort,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type { AggregationFilterKey } from './PartnershipAggregationFilters'

export const DEFAULT_AGGREGATION_QUERY: PartnershipAggregationQuery = {
  ownerIds: [],
  partnershipTypes: [],
  statuses: [],
  workflowStatuses: [],
  dataQuality: [],
  sort: 'partnership',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

const csv = (params: URLSearchParams, key: string) => [...new Set((params.get(key) ?? '').split(',').map((value) => value.trim()).filter(Boolean))]
const enumValues = <T extends string>(values: string[], allowed: readonly T[]) => values.filter((value): value is T => allowed.includes(value as T))

export function parsePartnershipAggregationSearchParams(params: URLSearchParams): PartnershipAggregationQuery {
  const page = Number(params.get('page'))
  const requestedPageSize = Number(params.get('pageSize'))
  const pageSize: PartnershipAggregationPageSize = requestedPageSize === 25 || requestedPageSize === 100 ? requestedPageSize : 50
  const sortValue = params.get('sort')
  const search = params.get('search')?.trim().slice(0, 200)
  return {
    ...(search ? { search } : {}),
    ownerIds: csv(params, 'ownerIds').sort(),
    partnershipTypes: enumValues(csv(params, 'partnershipTypes'), PARTNERSHIP_TYPES),
    statuses: enumValues(csv(params, 'statuses'), ['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'] as const),
    workflowStatuses: enumValues(csv(params, 'workflowStatuses'), PARTNERSHIP_AGGREGATION_WORKFLOWS),
    dataQuality: enumValues(csv(params, 'dataQuality'), PARTNERSHIP_DATA_QUALITIES),
    sort: PARTNERSHIP_AGGREGATION_SORTS.includes(sortValue as PartnershipAggregationSort) ? sortValue as PartnershipAggregationSort : 'partnership',
    direction: params.get('direction') === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize,
  }
}

export const aggregationFilterKeys: AggregationFilterKey[] = ['ownerIds', 'partnershipTypes', 'statuses', 'workflowStatuses', 'dataQuality']
