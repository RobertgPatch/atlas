# Spec 006 - Reports

## Goal
Provide report views powered by parsed K-1 data, manual inputs, and calculated fields.

## Scope
- Portfolio Summary
- Asset Class Summary
- Activity Detail
- inline editing
- undo
- CSV/XLSX export

## Functional Requirements
- activity rows keyed by entity + partnership + tax year
- activity rows created or updated on K-1 finalization
- editable fields save inline
- undo restores previous value for latest edit
- exports available in CSV and XLSX

## Acceptance Criteria
- all three reports load
- inline edits persist immediately
- undo works
- exports produce valid files
