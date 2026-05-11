# Data Model: Consolidated Holdings Report

## PlaidConnection

Represents one linked Plaid Item.

**Fields**: `id`, `owner_user_id`, `plaid_item_id`, `institution_id`, `institution_name`, `access_token_ciphertext` or `access_token_secret_ref`, `status`, `needs_update_reason`, `created_at`, `updated_at`, `last_successful_sync_at`.

**Relationships**: Has many `PlaidInvestmentAccount`; has many `HoldingsSyncSnapshot`.

**Validation**: `plaid_item_id` unique per tenant/user scope. Access token never returned by API responses.

## PlaidInvestmentAccount

Represents one investment account under a Plaid connection.

**Fields**: `id`, `plaid_connection_id`, `plaid_account_id`, `name`, `official_name`, `mask`, `type`, `subtype`, `custodian_name`, `selected_for_holdings_report`, `sync_status`, `last_synced_at`, `created_at`, `updated_at`.

**Relationships**: Belongs to `PlaidConnection`; has many `SourceHolding`.

**Validation**: Unique by `plaid_connection_id` + `plaid_account_id`. Only selected accounts are included in report refresh/query scope.

## HoldingsSyncSnapshot

Represents one holdings refresh attempt.

**Fields**: `id`, `requested_by_user_id`, `status`, `started_at`, `completed_at`, `selected_account_ids`, `plaid_request_ids`, `raw_payload_ref`, `error_type`, `error_code`, `error_message`, `created_at`.

**Relationships**: Has many `SourceHolding`; optionally references affected `PlaidConnection` and accounts.

**Validation**: Status is `pending`, `success`, `partial_success`, or `failed`. Failed snapshots do not replace the latest successful holdings for unaffected accounts.

## SourceHolding

Represents a position from Plaid or an imported fixture before rollup.

**Fields**: `id`, `sync_snapshot_id`, `plaid_investment_account_id`, `plaid_account_id`, `plaid_security_id`, `symbol`, `description`, `security_type`, `cusip`, `isin`, `currency_code`, `quantity`, `cost_basis_amount`, `institution_price`, `market_value_amount`, `unrealized_gain_loss_amount`, `as_of_date`, `raw_payload`, `created_at`.

**Relationships**: Belongs to `HoldingsSyncSnapshot` and `PlaidInvestmentAccount`; maps to one `SecurityIdentity`.

**Validation**: Quantity supports fractional decimals. Monetary fields allow null. Null means unknown, not zero.

## SecurityIdentity

Represents a normalized asset identity used for consolidation.

**Fields**: `id`, `identity_key`, `identity_source`, `confidence`, `symbol`, `description`, `security_type`, `cusip`, `isin`, `currency_code`, `plaid_security_ids`, `created_at`, `updated_at`.

**Relationships**: Has many `SourceHolding`; produces one `ConsolidatedHoldingRow` per report scope.

**Validation**: `identity_key` deterministic. `confidence` is `high`, `medium`, or `low`. Low-confidence identities are surfaced in the UI.

## ConsolidatedHoldingRow

Derived parent report row for one normalized asset.

**Fields**: `id`, `security_identity_id`, `symbol`, `description`, `type`, `custodian_summary`, `quantity_total`, `cost_basis_total`, `average_cost_basis`, `unrealized_gain_loss_total`, `gain_loss_percent`, `market_value_total`, `currency_code`, `detail_count`, `identity_confidence`.

**Relationships**: Has many `CustodianHoldingDetailRow`.

**Validation**: Totals are derived from the selected account scope and active filters. Average cost basis is null when known quantity is zero or unknown.

## CustodianHoldingDetailRow

Derived child report row for one contributing account/custodian holding.

**Fields**: `id`, `parent_row_id`, `source_holding_id`, `symbol`, `description`, `type`, `cost_basis`, `unrealized_gain_loss`, `custodian`, `account_name`, `account_mask`, `quantity`, `market_value`, `currency_code`, `sync_status`.

**Relationships**: Belongs to `ConsolidatedHoldingRow`.

**Validation**: Values remain faithful to the source holding. Child rows are never merged away in the API response.

## HoldingsReportFilterSet

Represents query options for report rendering and export.

**Fields**: `search`, `custodian`, `account_id`, `type`, `gain_loss_state`, `sort`, `direction`, `page`, `page_size`, `include_details`.

**Validation**: Sort fields are limited to `symbol`, `type`, `quantity`, `costBasis`, `unrealizedGainLoss`, and `marketValue`. Direction is `asc` or `desc`.

## State Transitions

**PlaidConnection.status**: `connected` -> `needs_update` -> `connected`; `connected` -> `disconnected`.

**PlaidInvestmentAccount.sync_status**: `never_synced` -> `pending` -> `success`; `pending` -> `failed`; `success` -> `needs_user_action`.

**HoldingsSyncSnapshot.status**: `pending` -> `success`, `partial_success`, or `failed`.

**Report row derivation**: Source holdings are immutable per snapshot. Consolidated rows are recalculated from the latest successful source holdings for selected accounts and the active filter set.
