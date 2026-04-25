// Feature 003 audit event names (K-1 Review and Finalization).
export const K1_AUDIT_EVENTS = {
  FIELD_CORRECTED: 'k1.field_corrected',
  ENTITY_MAPPED: 'k1.entity_mapped',
  PARTNERSHIP_MAPPED: 'k1.partnership_mapped',
  APPROVED: 'k1.approved',
  APPROVAL_REVOKED: 'k1.approval_revoked',
  FINALIZED: 'k1.finalized',
  ISSUE_OPENED: 'k1.issue_opened',
  ISSUE_RESOLVED: 'k1.issue_resolved',
} as const

export type K1AuditEventName = (typeof K1_AUDIT_EVENTS)[keyof typeof K1_AUDIT_EVENTS]

// Feature 004 audit event names (Partnership Management).
export const PARTNERSHIP_AUDIT_EVENTS = {
  CREATED: 'partnership.created',
  UPDATED: 'partnership.updated',
  FMV_RECORDED: 'partnership.fmv_recorded',
  COMMITMENT_CREATED: 'partnership.commitment.created',
  COMMITMENT_UPDATED: 'partnership.commitment.updated',
  CAPITAL_ACTIVITY_CREATED: 'partnership.capital_activity.created',
  CAPITAL_ACTIVITY_UPDATED: 'partnership.capital_activity.updated',
  ASSET_CREATED: 'partnership.asset.created',
  ASSET_FMV_RECORDED: 'partnership.asset.fmv_recorded',
  REPORT_COMMITMENT_EDITED: 'reports.portfolio_summary.commitment.edited',
  REPORT_COMMITMENT_UNDONE: 'reports.portfolio_summary.commitment.undone',
  REPORT_ACTIVITY_DETAIL_EDITED: 'reports.activity_detail.row.edited',
  REPORT_ACTIVITY_DETAIL_UNDONE: 'reports.activity_detail.row.undone',
} as const

export type PartnershipAuditEventName =
  (typeof PARTNERSHIP_AUDIT_EVENTS)[keyof typeof PARTNERSHIP_AUDIT_EVENTS]
