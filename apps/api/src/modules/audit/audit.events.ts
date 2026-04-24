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
