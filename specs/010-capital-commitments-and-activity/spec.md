# Spec 010 - Capital Commitments and Activity

## Goal

Add capital/budget/commitment functionality to partnerships so Atlas can accurately power reporting metrics such as Original Commitment, % Called, Unfunded, Paid-In, Distributions, Residual Value, DPI, RVPI, TVPI, and eventually IRR.

This feature allows users to define the committed capital/budget for a partnership, record capital calls and funded contributions, and use that data in partnership views and reports.

---

## Product Context

Atlas currently supports:
- K-1 ingestion
- reported distributions from K-1 Box 19A
- partnership FMV snapshots
- partnership reporting views

However, K-1 data alone is not enough to calculate core portfolio metrics.

This spec adds the missing capital tracking layer.

---

## Core Concepts

### Partnership Commitment

Represents the amount of capital/budget allocated to a partnership.

Example:

> PatchTrust committed $2,000,000 to Lion Triangle LLC.

This powers:
- Original Commitment
- % Called
- Unfunded Commitment
- Paid-In Capital
- Return metrics

---

### Capital Call

A request for money from the partnership/investment.

Example:

> Lion Triangle LLC requested $1,000,000 of the $2,000,000 commitment.

A capital call does not necessarily mean money was actually funded yet.

---

### Funded Contribution

Money actually sent/funded by the entity.

Example:

> PatchTrust funded $1,000,000.

This powers:
- Paid-In Capital
- % Called
- Unfunded Commitment
- IRR cash flow inputs later

---

### Reported Distribution

Already handled by K-1 parsing.

In V1:
- Reported Distribution = K-1 Box 19A
- This is not actual cash received

---

## Scope

### In Scope

- Add commitment data to a partnership
- Add/edit original commitment amount
- Add commitment date / start date / end date
- Add capital activity events
- Support capital calls
- Support funded contributions
- Support manual adjustments
- Calculate:
  - Paid-In
  - % Called
  - Unfunded
  - DPI
  - RVPI
  - TVPI
- Show capital summary on Partnership Detail
- Show capital activity timeline/table
- Update reports to use commitment/activity data
- Create or update Activity Detail rows when capital activity exists
- Audit all edits

---

### Out of Scope

- Actual bank transaction reconciliation
- Real-time API-based contribution tracking
- Automatic capital call document parsing
- Actual cash distribution tracking
- Full IRR engine if insufficient dated cash flow data exists
- Benchmark comparisons against S&P 500, gold, etc.
- Multi-commitment amendments beyond basic active commitment support

---

## Data Model

### `partnership_commitments`

Stores committed/budgeted capital for a partnership.

```sql
create table partnership_commitments (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  commitment_amount numeric(18,2) not null,
  commitment_date date,
  commitment_start_date date,
  commitment_end_date date,
  status text not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);