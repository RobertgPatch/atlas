import type {
  K1TrackerCalculation, K1TrackerFieldChange, K1TrackerImportDecision, K1TrackerImportPreview,
  K1TrackerPartnershipDetail, K1TrackerPartnershipSummary, K1TrackerSignoffState, K1TrackerYearDetail,
} from '../../../../../packages/types/src/k1-tracker'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'
export class K1TrackerApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly payload?: unknown) { super(code) }
  get isExpiredImport() { return this.code === 'IMPORT_EXPIRED' }
  get isConflict() { return this.status === 409 || this.code === 'STALE_TRACKER_REVISION' || this.code === 'SOURCE_CONFLICT' }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init, headers })
  if (!response.ok) { let payload: unknown; try { payload = await response.json() } catch { payload = undefined }; const code = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `HTTP_${response.status}`; throw new K1TrackerApiError(code, response.status, payload) }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
async function uploadWorkbook<T>(file: File, targetPartnershipId: string, onProgress?: (progress: number) => void): Promise<T> {
  if (!onProgress) {
    const form = new FormData(); form.set('file', file); form.set('targetPartnershipId', targetPartnershipId)
    return request('/k1-tracker/imports/preview', { method: 'POST', body: form })
  }
  return new Promise<T>((resolve, reject) => {
    const form = new FormData(); form.set('file', file); form.set('targetPartnershipId', targetPartnershipId)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/k1-tracker/imports/preview`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onerror = () => reject(new K1TrackerApiError('NETWORK_ERROR', 0))
    xhr.onload = () => {
      let payload: unknown
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined } catch { payload = undefined }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new K1TrackerApiError(payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `HTTP_${xhr.status}`, xhr.status, payload)); return }
      onProgress(100); resolve(payload as T)
    }
    xhr.send(form)
  })
}
export const k1TrackerClient = {
  list(search?: string): Promise<{ items: K1TrackerPartnershipSummary[] }> { return request(`/k1-tracker/partnerships?${new URLSearchParams(search ? { search } : {})}`) },
  partnership(id: string): Promise<K1TrackerPartnershipDetail> { return request(`/k1-tracker/partnerships/${id}`) },
  year(partnershipId: string, taxYear: number): Promise<K1TrackerYearDetail> { return request(`/k1-tracker/partnerships/${partnershipId}/years/${taxYear}`) },
  createYear(partnershipId: string, taxYear: number): Promise<K1TrackerYearDetail> { return request(`/k1-tracker/partnerships/${partnershipId}/years`, { method: 'POST', body: JSON.stringify({ taxYear, values: [] }) }) },
  updateYear(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[]): Promise<{ year: K1TrackerYearDetail; invalidatedTaxYears: number[] }> { return request(`/k1-tracker/partnerships/${partnershipId}/years/${taxYear}`, { method: 'PATCH', body: JSON.stringify({ expectedRevision, changes }) }) },
  deleteYear(partnershipId: string, taxYear: number, expectedRevision: number): Promise<void> { return request(`/k1-tracker/partnerships/${partnershipId}/years/${taxYear}?expectedRevision=${expectedRevision}`, { method: 'DELETE' }) },
  calculate(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[]): Promise<K1TrackerCalculation> { return request(`/k1-tracker/partnerships/${partnershipId}/years/${taxYear}/calculate`, { method: 'POST', body: JSON.stringify({ expectedRevision, changes }) }) },
  signoff(partnershipId: string, taxYear: number, expectedRevision: number, action: 'PREPARED' | 'REVIEWED' | 'INVALIDATED', reason?: string): Promise<K1TrackerSignoffState> { return request(`/k1-tracker/partnerships/${partnershipId}/years/${taxYear}/signoffs`, { method: 'POST', body: JSON.stringify({ expectedRevision, action, reason }) }) },
  previewImport(file: File, targetPartnershipId: string, onProgress?: (progress: number) => void): Promise<K1TrackerImportPreview> { return uploadWorkbook(file, targetPartnershipId, onProgress) },
  commitImport(importBatchId: string, targetPartnershipId: string, decisions: K1TrackerImportDecision[]) { return request<{ importBatchId: string; partnershipId: string; importedTaxYears: number[]; skippedTaxYears: number[] }>(`/k1-tracker/imports/${importBatchId}/commit`, { method: 'POST', body: JSON.stringify({ targetPartnershipId, decisions }) }) },
}
