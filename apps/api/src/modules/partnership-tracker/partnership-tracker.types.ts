export type PartnershipTrackerScope = { isAdmin: boolean; entityIds: string[] }

export type PartnershipTrackerErrorCode =
  | 'DATABASE_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'PARTNERSHIP_NOT_FOUND'
  | 'OWNER_NOT_FOUND'
  | 'YEAR_NOT_FOUND'
  | 'COMMITMENT_NOT_FOUND'
  | 'CASH_FLOW_NOT_FOUND'
  | 'LINKED_COMMITMENT_READ_ONLY'
  | 'NAV_NOT_FOUND'
  | 'DUPLICATE_PARTNERSHIP_NAME'
  | 'DUPLICATE_NAV_DATE'
  | 'STALE_PARTNERSHIP_REVISION'
  | 'STALE_COMMITMENT_REVISION'
  | 'STALE_CASH_FLOW_REVISION'
  | 'STALE_NAV_REVISION'
  | 'VALIDATION_ERROR'

export class PartnershipTrackerError extends Error {
  constructor(
    public readonly code: PartnershipTrackerErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}
