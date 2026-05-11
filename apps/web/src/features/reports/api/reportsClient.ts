import type {
  ActivityDetailRow,
  ActivityDetailResponse,
  AssetClassSummaryResponse,
  PortfolioSummaryResponse,
  ReportExportRequest,
  ReportsQueryBase,
  UndoActivityDetailEditRequest,
  UpdateActivityDetailRowRequest,
  UpdatePortfolioOriginalCommitmentRequest,
} from '../../../../../../packages/types/src/reports'
import type { PartnershipCommitment } from '../../../../../../packages/types/src/partnership-management'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  '/v1'

export class ReportsApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(code)
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }

    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP_${response.status}`

    throw new ReportsApiError(code, response.status, payload)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const requestBlob = async (
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> => {
  const headers = new Headers(init?.headers ?? {})
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }

    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP_${response.status}`

    throw new ReportsApiError(code, response.status, payload)
  }

  const disposition = response.headers.get('content-disposition')
  const match = disposition?.match(/filename="?([^";]+)"?/i)

  return {
    blob: await response.blob(),
    fileName: match?.[1] ?? null,
    contentType: response.headers.get('content-type'),
  }
}

const toQueryString = (
  query: ReportsQueryBase & { reportType?: string; format?: string },
): string => {
  const params = new URLSearchParams()

  if (query.search) params.set('search', query.search)
  if (query.dateRange) params.set('dateRange', String(query.dateRange))
  if (query.entityType) params.set('entityType', query.entityType)
  if (query.entityId) params.set('entityId', query.entityId)
  if (query.partnershipId) params.set('partnershipId', query.partnershipId)
  if (query.taxYear != null) params.set('taxYear', String(query.taxYear))
  if (query.sort) params.set('sort', query.sort)
  if (query.direction) params.set('direction', query.direction)
  if (query.page != null) params.set('page', String(query.page))
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize))
  if (query.reportType) params.set('reportType', query.reportType)
  if (query.format) params.set('format', query.format)

  return params.toString()
}

export const reportsClient = {
  getPortfolioSummary(query: ReportsQueryBase): Promise<PortfolioSummaryResponse> {
    const queryString = toQueryString(query)
    const path = queryString
      ? `/reports/portfolio-summary?${queryString}`
      : '/reports/portfolio-summary'
    return request<PortfolioSummaryResponse>(path)
  },

  getAssetClassSummary(query: ReportsQueryBase): Promise<AssetClassSummaryResponse> {
    const queryString = toQueryString(query)
    const path = queryString
      ? `/reports/asset-class-summary?${queryString}`
      : '/reports/asset-class-summary'
    return request<AssetClassSummaryResponse>(path)
  },

  getActivityDetail(query: ReportsQueryBase): Promise<ActivityDetailResponse> {
    const queryString = toQueryString(query)
    const path = queryString
      ? `/reports/activity-detail?${queryString}`
      : '/reports/activity-detail'
    return request<ActivityDetailResponse>(path)
  },

  exportReport(query: ReportExportRequest) {
    const queryString = toQueryString(query)
    const path = queryString ? `/reports/export?${queryString}` : '/reports/export'
    return requestBlob(path)
  },

  updatePortfolioOriginalCommitment(
    payload: UpdatePortfolioOriginalCommitmentRequest,
  ): Promise<PartnershipCommitment> {
    return request<PartnershipCommitment>(
      `/partnerships/${payload.partnershipId}/commitments/${payload.commitmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          commitmentAmountUsd: payload.commitmentAmountUsd,
          expectedUpdatedAt: payload.expectedUpdatedAt,
        }),
      },
    )
  },

  updateActivityDetailRow(
    payload: UpdateActivityDetailRowRequest,
  ): Promise<ActivityDetailRow> {
    const { rowId, ...body } = payload
    return request<ActivityDetailRow>(`/reports/activity-detail/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  undoActivityDetailEdit(
    payload: UndoActivityDetailEditRequest,
  ): Promise<ActivityDetailRow> {
    return request<ActivityDetailRow>(`/reports/activity-detail/${payload.rowId}/undo`, {
      method: 'POST',
    })
  },
}
