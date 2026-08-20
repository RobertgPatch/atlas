// Shared wire types for the K-1 Ingestion API (Feature 002).
// Mirrors specs/002-k1-ingestion/contracts/k1-ingestion.openapi.yaml.
export const K1_STATUSES = [
    'UPLOADED',
    'PROCESSING',
    'NEEDS_REVIEW',
    'READY_FOR_APPROVAL',
    'FINALIZED',
];
// Durable batch ingestion contracts (Feature 022).
export const K1_INGESTION_BATCH_STATUSES = [
    'OPEN',
    'PROCESSING',
    'ACTION_REQUIRED',
    'COMPLETED',
    'PARTIAL_FAILURE',
    'CANCELLED',
];
export const K1_INGESTION_ITEM_STATUSES = [
    'PENDING_UPLOAD',
    'UPLOADED',
    'VALIDATING',
    'QUEUED',
    'PROCESSING',
    'NEEDS_MATCH',
    'NEEDS_REVIEW',
    'READY_TO_APPLY',
    'APPLIED',
    'FAILED',
    'CANCELLED',
];
export const K1_EXTRACTION_PROVIDERS = ['AWS_BDA', 'STUB'];
export const K1_EXTRACTION_ATTEMPT_STATUSES = [
    'CREATED',
    'SUBMITTED',
    'IN_PROGRESS',
    'SUCCEEDED',
    'FAILED',
    'SUPERSEDED',
];
export const K1_EXTRACTED_VALUE_KINDS = [
    'STRING',
    'NUMBER',
    'BOOLEAN',
    'DATE',
    'PERCENTAGE',
    'MONEY',
    'CODE_ROW',
];
export const K1_EXTRACTION_DESTINATION_KINDS = [
    'CALCULATION',
    'OFFICIAL',
    'MATCH_SIGNAL',
    'EVIDENCE_ONLY',
];
