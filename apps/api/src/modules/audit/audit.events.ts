// Feature 003 audit event names (K-1 Review and Finalization).
export const LIQUIDITY_CSV_AUDIT_EVENTS = {
  UPLOAD: 'liquidity.csv.upload', COMPLETE: 'liquidity.csv.complete', PARSE: 'liquidity.csv.parse',
  REPROCESS: 'liquidity.csv.reprocess',
  MAPPING: 'liquidity.csv.mapping', REVIEW: 'liquidity.csv.review', APPLY: 'liquidity.csv.apply',
  CANCEL: 'liquidity.csv.cancel', RETRY: 'liquidity.csv.retry', DOWNLOAD: 'liquidity.csv.download',
  ACCOUNT: 'liquidity.account.updated',
} as const

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
  ASSET_UPDATED: 'partnership.asset.updated',
  ASSET_DELETED: 'partnership.asset.deleted',
  ASSET_FMV_RECORDED: 'partnership.asset.fmv_recorded',
  REPORT_COMMITMENT_EDITED: 'reports.portfolio_summary.commitment.edited',
  REPORT_COMMITMENT_UNDONE: 'reports.portfolio_summary.commitment.undone',
  REPORT_ACTIVITY_DETAIL_EDITED: 'reports.activity_detail.row.edited',
  REPORT_ACTIVITY_DETAIL_UNDONE: 'reports.activity_detail.row.undone',
} as const

export type PartnershipAuditEventName =
  (typeof PARTNERSHIP_AUDIT_EVENTS)[keyof typeof PARTNERSHIP_AUDIT_EVENTS]

export const K1_TRACKER_AUDIT_EVENTS = {
  YEAR_CREATED: 'k1_tracker.year_created',
  YEAR_UPDATED: 'k1_tracker.year_updated',
  YEAR_DELETED: 'k1_tracker.year_deleted',
  SIGNOFF_PREPARED: 'k1_tracker.signoff_prepared',
  SIGNOFF_REVIEWED: 'k1_tracker.signoff_reviewed',
  SIGNOFF_INVALIDATED: 'k1_tracker.signoff_invalidated',
} as const

export type K1TrackerAuditEventName =
  (typeof K1_TRACKER_AUDIT_EVENTS)[keyof typeof K1_TRACKER_AUDIT_EVENTS]

export const PARTNERSHIP_TRACKER_AUDIT_EVENTS = {
  PARTNERSHIP_CREATED: 'partnership_tracker.partnership.created',
  PARTNERSHIP_UPDATED: 'partnership_tracker.partnership.updated',
  PARTNERSHIP_DELETED: 'partnership_tracker.partnership.deleted',
  K1_YEAR_COPIED: 'partnership_tracker.k1_year.copied',
  MANUAL_YEAR_CREATED: 'partnership_tracker.manual_year.created',
  MANUAL_YEAR_UPDATED: 'partnership_tracker.manual_year.updated',
  MANUAL_YEAR_DELETED: 'partnership_tracker.manual_year.deleted',
  COMMITMENT_CREATED: 'partnership_tracker.commitment.created',
  COMMITMENT_UPDATED: 'partnership_tracker.commitment.updated',
  COMMITMENT_DELETED: 'partnership_tracker.commitment.deleted',
  NAV_CREATED: 'partnership_tracker.nav.created',
  NAV_UPDATED: 'partnership_tracker.nav.updated',
  NAV_DELETED: 'partnership_tracker.nav.deleted',
  DRAFT_RECALCULATED: 'partnership_tracker.year.recalculated',
  SIGNOFF_PREPARED: 'partnership_tracker.signoff.prepared',
  SIGNOFF_REVIEWED: 'partnership_tracker.signoff.reviewed',
  SIGNOFF_INVALIDATED: 'partnership_tracker.signoff.invalidated',
} as const

export type PartnershipTrackerAuditEventName =
  (typeof PARTNERSHIP_TRACKER_AUDIT_EVENTS)[keyof typeof PARTNERSHIP_TRACKER_AUDIT_EVENTS]
