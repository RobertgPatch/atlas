# Authorization Matrix: Liquidity CSV Imports

Use existing unique session identities and server-side Admin/entity checks. Action names below describe policy operations; they do not imply a new user-role system.

| Actor | Action | Required scope / constraints | Audit |
|---|---|---|---|
| Scoped viewer | Holdings, history, account freshness, permitted exports | Read access to every included entity/account; no original-file access by default | Existing access/export policy |
| Admin uploader | Upload capability/complete/status/cancel | Entity write access; exact import key/version, quota and state; cancel unapplied only | Actor/import IDs, state/result |
| Admin reviewer | Original and parsed evidence download | Entity access plus review privilege; short-lived authorized URL | Evidence access |
| Admin reviewer | Map headers, bind accounts, correct/acknowledge fields | Same entity on import and all accounts; immutable profile/review versions, reason for corrections | Protected revision plus redacted event |
| Admin reviewer | Preview/apply | Same scope plus reviewed complete-account declaration; expiry/hash/version checks | Application/target IDs and outcome |
| Admin account manager | Inclusion/cadence/create account | Authorized entity and expected account version | Before/after metadata hashes |
| Admin/operator | Retry transient failed parse | Import scope, bounded attempt policy; new immutable attempt | Retry reason/version |
| API parser service | Read validated CSV, persist scoped draft | Exact CSV prefixes/KMS and persisted import identity; cannot self-approve or invoke Bedrock | Job/run outcomes |
| API apply service | Write approved snapshots | Invoked by authorized reviewer with scope recheck and locks | Transactional audit |
| Market-data service | Read approved supported positions, write valuations | No draft/original access; no quantity/basis mutation | Price provenance |
| Operator | Retire Plaid credentials | Existing operational procedure; no secret output | Redacted retirement evidence |

## Required denials

- Viewer cannot upload, download originals, map/correct, retry, publish or manage accounts.
- Another entity's import/account/hash cannot be discovered or bound by ID manipulation.
- Multi-account files cannot straddle an unauthorized entity or a different custodian through one upload binding. Account scope comes from authorized stable bindings; matching tickers never authorize writes to another account.
- Client-supplied S3 key, MIME, hash, account ID or processing status is never trusted as authority.
- Background job without valid persisted import/entity/generation fails closed.
- Applied evidence cannot be edited/cancelled; corrections create new reviewed versions/snapshots.
- Account ownership change needs both scopes and related-record migration; ordinary rename cannot reassign it.
- API parser receives no BDA invoke permissions or access to K-1 content for this feature.
- Safe status responses do not expose raw CSV lines, full account numbers or provider credentials.
