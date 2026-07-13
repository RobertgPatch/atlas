import type { PoolClient, QueryResultRow } from 'pg'
import type {
  K1TrackerFieldChange,
  K1TrackerFieldKey,
  K1TrackerSourceType,
  K1TrackerWorkflowStatus,
} from './k1-tracker.contracts.js'

export type Queryable = Pick<PoolClient, 'query'>
export type TrackerScope = { isAdmin: boolean; entityIds: string[] }

export interface TrackerYearRow extends QueryResultRow {
  id: string
  entity_id: string
  partnership_id: string
  tax_year: number
  workflow_status: K1TrackerWorkflowStatus
  revision: number
  source_conflict_count: number
  warning_count: number
  calculation_version: string
  ending_outside_basis: string | null
  cumulative_suspended_loss: string | null
  taxable_excess_distribution: string | null
  section_l_difference: string | null
  created_at: Date | string
  updated_at: Date | string
}

export interface TrackerValueRow extends QueryResultRow {
  id: string
  tracker_year_id: string
  field_key: K1TrackerFieldKey
  amount: string | null
  original_source_text: string | null
  source_type: K1TrackerSourceType
  source_k1_document_id: string | null
  source_k1_field_value_id: string | null
  import_batch_id: string | null
  source_sheet: string | null
  source_cell: string | null
  carryforward_from_year_id: string | null
  override_reason: string | null
  is_active: boolean
  created_by_user_id: string | null
  created_by_email?: string | null
  created_at: Date | string
}

export interface TrackerYearInput {
  id: string
  taxYear: number
  revision: number
  status: K1TrackerWorkflowStatus
  values: Partial<Record<K1TrackerFieldKey, bigint | null>>
}

export interface TrackerMutation {
  expectedRevision: number
  changes: K1TrackerFieldChange[]
}

export class K1TrackerError extends Error {
  constructor(
    public readonly code:
      | 'DATABASE_REQUIRED'
      | 'TRACKER_NOT_FOUND'
      | 'STALE_TRACKER_REVISION'
      | 'FORBIDDEN_TRACKER_ENTITY'
      | 'SOURCE_CONFLICT'
      | 'IMPORT_NOT_FOUND'
      | 'IMPORT_EXPIRED'
      | 'SIGNOFF_GATE_FAILED'
      | 'INVALID_IMPORT',
    message: string = code,
  ) {
    super(message)
  }
}

export const isInScope = (entityId: string, scope: TrackerScope): boolean =>
  scope.isAdmin || scope.entityIds.includes(entityId)
