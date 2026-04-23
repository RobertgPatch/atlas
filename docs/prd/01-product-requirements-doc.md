# Atlas Product Requirements Document

## Product
Atlas is a private, single-tenant, deployable financial intelligence system for family offices and similar sensitive clients.

## Users
- admin
- cpa
- cfo
- reviewer

## Core Problem
Family offices process K-1s manually across Excel and multiple systems, causing fragmented data, errors, and poor visibility into expected distributions and entity-partnership relationships.

## North Star Outcome
A CPA/CFO can upload, parse, normalize, map, review, and finalize K-1s quickly, then view expected distributions and related reporting across entities and partnerships.

## V1 Includes
- K-1 upload and parsing
- entity + partnership mapping
- issue queue
- review and finalization
- reported distribution from Box 19A
- partnership directory and detail pages
- shared dashboards
- reports
- partnership FMV snapshots
- inline editing with undo
- CSV/XLSX export
- admin user management
- MFA
- encryption in transit and at rest

## V1 Excludes
- QuickBooks replacement
- Bill.com replacement
- real-time bank integrations
- live FMV APIs
- AI chat
- full accounting ledger
- full ownership graph
- multi-tenant shared SaaS
