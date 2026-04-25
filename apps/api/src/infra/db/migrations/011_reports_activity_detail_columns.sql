-- Migration 011: Reports Activity Detail Columns
-- Feature: 006-reports

begin;

alter table if exists partnership_annual_activity
  add column if not exists beginning_basis_amount numeric(18,2),
  add column if not exists contributions_amount numeric(18,2),
  add column if not exists remaining_k1_amount numeric(18,2),
  add column if not exists other_adjustments_amount numeric(18,2),
  add column if not exists ending_tax_basis_amount numeric(18,2),
  add column if not exists book_to_book_adjustment_amount numeric(18,2),
  add column if not exists k1_vs_tax_difference_amount numeric(18,2),
  add column if not exists excess_distribution_amount numeric(18,2),
  add column if not exists negative_basis_flag boolean not null default false,
  add column if not exists ending_basis_amount numeric(18,2);

commit;
