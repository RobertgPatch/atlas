# Data Model: Persistent Production Data

## User Profile

**Purpose**: Durable login identity and role/status state.

**Fields**: `id`, `email`, `password_hash`, `is_active`, `created_at`, `updated_at`, role membership, optional status/lifecycle metadata needed to distinguish invited, active, and inactive users.

**Relationships**: One user has one or more roles; one user may have one active MFA enrollment; one user may have many sessions; one user may own many Plaid connections.

**Validation**:

- Email is unique case-insensitively for login purposes.
- Password verifier is never returned in API responses.
- Role and active/inactive status changes survive redeploy.

## MFA Enrollment

**Purpose**: Durable authenticator enrollment state so users do not rescan QR codes after deploy.

**Fields**: `id`, `user_id`, protected TOTP secret, `enrollment_state`, `enrolled_at`, `reset_at`, `updated_by`, `created_at`, `updated_at`.

**Relationships**: Belongs to one user.

**State Transitions**:

- `PENDING` -> `ENROLLED` after successful first TOTP verification.
- `ENROLLED` -> `RESET_REQUIRED` after admin reset.
- `RESET_REQUIRED` -> `PENDING` when a new setup starts.

**Validation**:

- Only one active enrollment record per user.
- Completed enrollment must be durable before returning successful enrollment to the client.
- Protected secret is never returned after setup completion.

## Auth Session

**Purpose**: Durable signed-in session state for cookie-based authentication.

**Fields**: `id`, `user_id`, `session_token_hash`, `issued_at`, `last_activity_at`, `expires_at`, `revoked_at`, `revoke_reason`, `created_at`.

**Relationships**: Belongs to one user.

**State Transitions**:

- Active when not expired and not revoked.
- Revoked on logout, role/status security action, or MFA reset.
- Expired when absolute or idle lifetime is exceeded.

**Validation**:

- Raw session token is never stored or logged.
- Session touch updates `last_activity_at` durably.
- Revocation survives deploy.

## Plaid Connection

**Purpose**: Durable institution connection for future account listing and holdings refresh.

**Fields**: `id`, `owner_user_id`, `plaid_item_id`, `institution_id`, `institution_name`, protected access token, `status`, `needs_update_reason`, `last_successful_sync_at`, `created_at`, `updated_at`.

**Relationships**: Belongs to one user; has many investment accounts.

**State Transitions**:

- `connected` after public-token exchange.
- `needs_update` when Plaid requires update/reconnect.
- `disconnected` when user removes or invalidates the connection.

**Validation**:

- `plaid_item_id` is unique.
- Access token is never returned to browser responses or logs.
- Existing connection is updated instead of duplicated when the same item reconnects.

## Investment Account

**Purpose**: Display-safe metadata and report-selection state for a Plaid investment account.

**Fields**: `id`, `plaid_connection_id`, `plaid_account_id`, `name`, `official_name`, `mask`, `account_type`, `account_subtype`, `custodian_name`, `selected_for_holdings_report`, `sync_status`, `last_synced_at`, `created_at`, `updated_at`.

**Relationships**: Belongs to one Plaid connection; has many source holdings over time.

**Validation**:

- One row per connection/account id pair.
- Selection state survives deploy and applies to Liquidity report queries.
- Account metadata is safe for browser display.

## Holdings Sync Snapshot

**Purpose**: Durable record of each holdings refresh attempt.

**Fields**: `id`, `requested_by_user_id`, `status`, `started_at`, `completed_at`, `selected_account_ids`, Plaid request ids, raw sync metadata if safe, error type/code/message, `created_at`.

**Relationships**: Has many source holdings; references selected investment accounts by id.

**Validation**:

- Status is one of pending, success, partial success, or failed.
- Latest successful sync is available after deploy.
- Error messages must not include sensitive credential material.

## Source Holding

**Purpose**: Durable account-level holding facts used to rebuild the Liquidity report.

**Fields**: `id`, `sync_snapshot_id`, `plaid_investment_account_id`, `plaid_account_id`, `plaid_security_id`, `symbol`, `description`, `security_type`, `cusip`, `isin`, `currency_code`, `quantity`, `cost_basis_amount`, `institution_price`, `market_value_amount`, `unrealized_gain_loss_amount`, `as_of_date`, raw payload if safe, `created_at`.

**Relationships**: Belongs to one sync snapshot and one investment account.

**Validation**:

- Numeric facts distinguish unknown values from zero.
- Latest holdings for selected accounts rebuild parent/detail Liquidity rows.
- Raw payload storage must exclude or protect sensitive values.

## Persistence Diagnostic

**Purpose**: Operator-visible status describing whether critical workflows are durable.

**Fields**: `storageMode`, `databaseConfigured`, `migrationsReady`, `authPersistence`, `plaidPersistence`, `warnings`, `checkedAt`.

**Validation**:

- Production cannot report healthy durable persistence if auth or Plaid repositories are temporary.
- Diagnostics never include secret values or connection strings.
