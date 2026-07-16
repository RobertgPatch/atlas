import {
  PARTNERSHIP_AGGREGATION_SORTS,
  PARTNERSHIP_AGGREGATION_WORKFLOWS,
  PARTNERSHIP_DATA_QUALITIES,
  PARTNERSHIP_TYPES,
} from '../../../../../../packages/types/src/partnership-tracker'
import type {
  CalculatePartnershipTrackerYearRequest,
  CreatePartnershipCommitmentEntryRequest,
  CreatePartnershipNavEntryRequest,
  CreateTrackedPartnershipRequest,
  K1TrackerCalculation,
  PartnershipAggregationQuery,
  PartnershipAggregationResponse,
  PartnershipCommitmentEntry,
  PartnershipManagementFeeEstimate,
  PartnershipNavEntry,
  PartnershipTrackerDetail,
  PartnershipTrackerListResponse,
  PartnershipTrackerSignoffAction,
  PartnershipTrackerSummary,
  PartnershipTrackerYearDetail,
  PartnershipType,
  UpdatePartnershipCommitmentEntryRequest,
  UpdatePartnershipNavEntryRequest,
  UpdatePartnershipTrackerYearRequest,
  UpdateTrackedPartnershipRequest,
} from '../../../../../../packages/types/src/partnership-tracker'
import { normalizeCurrencyInput } from '../../../components/shared/currencyInput'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export class PartnershipTrackerApiError extends Error {
  readonly code: string
  readonly status: number
  readonly payload?: unknown
  constructor(code: string, status: number, payload?: unknown) {
    super(code)
    this.code = code
    this.status = status
    this.payload = payload
  }
  get isStale() { return this.code.startsWith('STALE_') }
  get isDuplicate() { return this.code.startsWith('DUPLICATE_') }
}

export function serializeTrackerMoney(value: string): string {
  const parsed = normalizeCurrencyInput(value)
  if (parsed.error || parsed.value == null) throw new Error(parsed.error ?? 'Enter a valid amount.')
  return parsed.value
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init, headers })
  if (!response.ok) {
    let payload: unknown
    try { payload = await response.json() } catch { payload = undefined }
    const code = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `HTTP_${response.status}`
    throw new PartnershipTrackerApiError(code, response.status, payload)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const root = '/partnership-tracker/partnerships'
const aggregationRoot = '/partnership-tracker/aggregation'
export type PartnershipTrackerListParams = {
  search?: string; entityId?: string; partnershipType?: PartnershipType; status?: string; limit?: number; cursor?: string
}

export type PartnershipAggregationParams = Partial<PartnershipAggregationQuery>

const canonicalValues = <T extends string>(values: readonly T[] | undefined, order: readonly T[]) => {
  if (!values?.length) return []
  const selected = new Set(values)
  return order.filter((value) => selected.has(value))
}

export function serializePartnershipAggregationParams(params: PartnershipAggregationParams = {}): string {
  const query = new URLSearchParams()
  const search = params.search?.trim()
  if (search) query.set('search', search.slice(0, 200))
  const ownerIds = [...new Set(params.ownerIds ?? [])].sort()
  if (ownerIds.length) query.set('ownerIds', ownerIds.join(','))
  const partnershipTypes = canonicalValues(params.partnershipTypes, PARTNERSHIP_TYPES)
  if (partnershipTypes.length) query.set('partnershipTypes', partnershipTypes.join(','))
  const statuses = canonicalValues(params.statuses, ['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'] as const)
  if (statuses.length) query.set('statuses', statuses.join(','))
  const workflowStatuses = canonicalValues(params.workflowStatuses, PARTNERSHIP_AGGREGATION_WORKFLOWS)
  if (workflowStatuses.length) query.set('workflowStatuses', workflowStatuses.join(','))
  const dataQuality = canonicalValues(params.dataQuality, PARTNERSHIP_DATA_QUALITIES)
  if (dataQuality.length) query.set('dataQuality', dataQuality.join(','))
  if (params.sort && params.sort !== 'partnership' && PARTNERSHIP_AGGREGATION_SORTS.includes(params.sort)) query.set('sort', params.sort)
  if (params.direction === 'desc') query.set('direction', 'desc')
  if (params.page && params.page > 1) query.set('page', String(Math.floor(params.page)))
  if (params.pageSize === 25 || params.pageSize === 100) query.set('pageSize', String(params.pageSize))
  return query.toString()
}

export const partnershipTrackerClient = {
  aggregation(params: PartnershipAggregationParams = {}): Promise<PartnershipAggregationResponse> {
    const query = serializePartnershipAggregationParams(params)
    return request(`${aggregationRoot}${query ? `?${query}` : ''}`)
  },
  list(params: PartnershipTrackerListParams = {}): Promise<PartnershipTrackerListResponse> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value != null && value !== '') query.set(key, String(value))
    return request(`${root}?${query}`)
  },
  get(partnershipId: string): Promise<PartnershipTrackerDetail> { return request(`${root}/${partnershipId}`) },
  create(body: CreateTrackedPartnershipRequest): Promise<{ partnership: PartnershipTrackerSummary; nextAction: 'ADD_K1_YEAR' }> {
    return request(root, { method: 'POST', body: JSON.stringify(body) })
  },
  update(partnershipId: string, body: UpdateTrackedPartnershipRequest): Promise<PartnershipTrackerSummary> {
    return request(`${root}/${partnershipId}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  listCommitments(partnershipId: string, asOfDate?: string): Promise<{ items: PartnershipCommitmentEntry[]; effectiveEntry: PartnershipCommitmentEntry | null }> {
    const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : ''
    return request(`${root}/${partnershipId}/commitments${query}`)
  },
  managementFees(partnershipId: string, asOfDate?: string): Promise<PartnershipManagementFeeEstimate> {
    const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : ''
    return request(`${root}/${partnershipId}/management-fees${query}`)
  },
  createCommitment(partnershipId: string, body: CreatePartnershipCommitmentEntryRequest): Promise<PartnershipCommitmentEntry> {
    return request(`${root}/${partnershipId}/commitments`, { method: 'POST', body: JSON.stringify({ ...body, amount: serializeTrackerMoney(body.amount) }) })
  },
  updateCommitment(partnershipId: string, commitmentId: string, body: UpdatePartnershipCommitmentEntryRequest): Promise<PartnershipCommitmentEntry> {
    return request(`${root}/${partnershipId}/commitments/${commitmentId}`, { method: 'PATCH', body: JSON.stringify({ ...body, amount: body.amount == null ? undefined : serializeTrackerMoney(body.amount) }) })
  },
  deleteCommitment(partnershipId: string, commitmentId: string, expectedUpdatedAt: string): Promise<void> {
    return request(`${root}/${partnershipId}/commitments/${commitmentId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, { method: 'DELETE' })
  },
  listNav(partnershipId: string): Promise<{ items: PartnershipNavEntry[]; latest: PartnershipNavEntry | null }> { return request(`${root}/${partnershipId}/nav`) },
  createNav(partnershipId: string, body: CreatePartnershipNavEntryRequest): Promise<PartnershipNavEntry> {
    return request(`${root}/${partnershipId}/nav`, { method: 'POST', body: JSON.stringify({ ...body, amount: serializeTrackerMoney(body.amount) }) })
  },
  updateNav(partnershipId: string, navEntryId: string, body: UpdatePartnershipNavEntryRequest): Promise<PartnershipNavEntry> {
    return request(`${root}/${partnershipId}/nav/${navEntryId}`, { method: 'PATCH', body: JSON.stringify({ ...body, amount: body.amount == null ? undefined : serializeTrackerMoney(body.amount) }) })
  },
  deleteNav(partnershipId: string, navEntryId: string, expectedUpdatedAt: string): Promise<void> {
    return request(`${root}/${partnershipId}/nav/${navEntryId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, { method: 'DELETE' })
  },
  getYear(partnershipId: string, taxYear: number): Promise<PartnershipTrackerYearDetail> { return request(`${root}/${partnershipId}/years/${taxYear}`) },
  createYear(partnershipId: string, taxYear: number): Promise<PartnershipTrackerYearDetail> {
    return request(`${root}/${partnershipId}/years`, { method: 'POST', body: JSON.stringify({ taxYear }) })
  },
  updateYear(partnershipId: string, taxYear: number, body: UpdatePartnershipTrackerYearRequest): Promise<PartnershipTrackerYearDetail> {
    return request(`${root}/${partnershipId}/years/${taxYear}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteYear(partnershipId: string, taxYear: number, expectedRevision: number): Promise<void> {
    return request(`${root}/${partnershipId}/years/${taxYear}?expectedRevision=${expectedRevision}`, { method: 'DELETE' })
  },
  calculate(partnershipId: string, taxYear: number, expectedRevision: number, body: CalculatePartnershipTrackerYearRequest): Promise<K1TrackerCalculation> {
    return request(`${root}/${partnershipId}/years/${taxYear}/calculate`, { method: 'POST', body: JSON.stringify({ ...body, expectedRevision }) })
  },
  signoff(partnershipId: string, taxYear: number, expectedRevision: number, action: PartnershipTrackerSignoffAction, reason?: string): Promise<PartnershipTrackerYearDetail> {
    return request(`${root}/${partnershipId}/years/${taxYear}/signoffs`, { method: 'POST', body: JSON.stringify({ expectedRevision, action, reason }) })
  },
}
