# Spec 002 - K1 Ingestion

## Goal
Support K-1 upload, storage, parsing, and lifecycle state management.

## Scope
- upload center
- document records
- K-1 records
- parse trigger
- status transitions

## Functional Requirements
- upload K-1 PDF
- create `documents` and `k1_documents`
- persist extracted fields in `k1_field_values`
- create issues when required values are missing or low confidence

## Acceptance Criteria
- upload succeeds
- parse result persists
- issue queue triggers correctly
- valid documents advance toward approval
