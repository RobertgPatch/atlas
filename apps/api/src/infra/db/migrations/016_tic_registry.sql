begin;

create table if not exists tic_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text,
  property_code text,
  number_of_units integer check (number_of_units is null or number_of_units >= 0),
  property_type text not null check (
    property_type in (
      'multifamily',
      'retail',
      'office',
      'industrial',
      'self_storage',
      'hospitality',
      'land',
      'mixed_use',
      'other'
    )
  ),
  status text not null default 'held' check (status in ('held', 'under_contract', 'sold')),
  acquired_date date,
  acquisition_price_usd numeric(18,2) check (acquisition_price_usd is null or acquisition_price_usd >= 0),
  notes text,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tic_interests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references tic_properties(id) on delete cascade,
  name text not null,
  property_percentage numeric(9,4) not null check (property_percentage >= 0 and property_percentage <= 100),
  status text not null default 'active' check (status in ('active', 'rolled', 'exited')),
  acquisition_origin text not null check (acquisition_origin in ('cash', 'exchange')),
  relinquished_interest_id uuid references tic_interests(id) on delete set null,
  relinquished_source_name text,
  relinquished_source_label text,
  acquisition_date date,
  acquisition_value_usd numeric(18,2) check (acquisition_value_usd is null or acquisition_value_usd >= 0),
  notes text,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tic_interests_no_self_source check (relinquished_interest_id is null or relinquished_interest_id <> id)
);

create table if not exists tic_owners (
  id uuid primary key default gen_random_uuid(),
  tic_interest_id uuid not null references tic_interests(id) on delete cascade,
  name text not null,
  owner_type text not null check (
    owner_type in ('individual', 'llc', 'trust', 'partnership', 's_corp', 'ira', 'other')
  ),
  tic_percentage numeric(9,4) not null check (tic_percentage >= 0 and tic_percentage <= 100),
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tic_properties_name_idx
  on tic_properties (lower(name));

create index if not exists tic_properties_code_idx
  on tic_properties (lower(property_code));

create index if not exists tic_properties_status_idx
  on tic_properties (status);

create index if not exists tic_interests_property_idx
  on tic_interests (property_id);

create index if not exists tic_interests_property_name_idx
  on tic_interests (property_id, lower(name));

create index if not exists tic_interests_relinquished_idx
  on tic_interests (relinquished_interest_id);

create index if not exists tic_owners_interest_idx
  on tic_owners (tic_interest_id);

create index if not exists tic_owners_interest_name_idx
  on tic_owners (tic_interest_id, lower(name));

commit;
