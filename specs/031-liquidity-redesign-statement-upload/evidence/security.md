# Security and financial integrity verification

2026-09-21. Synthetic inputs only; neither supplied client CSV is copied into Git.

- Auth/route tests reject anonymous callers and non-Admin import mutations/read-original actions. Source accounts and financial reads retain entity scope. Cross-custodian bindings and changed account versions are rejected.
- Conditional-create local evidence and offline S3 signing/version/checksum fixtures verify immutable originals, namespace rejection, exact size/hash, required headers and expiry bounds. Live bucket policy/CORS/KMS verification is still a rollout action.
- Parser and schema tests cover malformed widths/quotes, duplicate/prototype headers, binary/invalid encoding, bounds, exact decimals and leading-zero identifiers. Cells are never executed or treated as instructions.
- Spreadsheet exports neutralize formula/control text prefixes while preserving valid negative amounts. Core money exports retain exact decimal strings. Mixed-currency portfolio totals/subtotals are unavailable without FX; native row values retain their currency.
- Review and apply tests preserve immutable raw evidence, reject arbitrary correction paths/stale versions, recalculate dependencies and roll back snapshots/current pointers when audit insertion fails. Historical-only evidence does not supersede approved composition.
- Finite telemetry labels and safe error messages cannot accept private account/filename/security/amount canaries. Financial before/after values are retained only in protected review evidence.
- Upload admission serializes reservations and enforces file, byte, hourly, outstanding and queued capacity. Expiry cleanup releases abandoned reservations. Duplicate/replay cannot multiply active work.
- CSV modules call neither Plaid nor AI/OCR/BDA. Account ownership suppresses the common Plaid refresh entry point after cutover. Default-false quote tests cover cached quotes and false/true/false transitions while preserving CSV quantity/basis.
- Runtime dependency audit: zero API runtime, web runtime and API build/test findings. Environment topology and cost-envelope validation passed. Route policy coverage includes all local CSV routes.

These are local assertions and mocked provider/storage tests, not a penetration test or proof of production IAM. Protected originals contain client data and must remain private/versioned; backups and object versions need coordinated recovery. The legacy SDK remains intentionally installed until T072's live retirement prerequisites are met.
