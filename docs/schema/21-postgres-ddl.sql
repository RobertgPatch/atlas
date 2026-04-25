create table users (
  id uuid primary key,
  email text unique not null,
  password_hash text not null,
  mfa_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id uuid primary key,
  name text unique not null
);

create table user_roles (
  id uuid primary key,
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  unique (user_id, role_id)
);

create table entities (
  id uuid primary key,
  name text not null,
  entity_type text not null,
  status text not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table partnerships (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  name text not null,
  asset_class text,
  status text not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key,
  document_type text not null default 'K1',
  file_name text not null,
  storage_path text not null,
  mime_type text,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

create table k1_documents (
  id uuid primary key,
  document_id uuid not null references documents(id),
  partnership_id uuid references partnerships(id),
  tax_year int not null,
  partnership_name_raw text,
  processing_status text not null default 'UPLOADED',
  is_amended boolean not null default false,
  user_approved boolean not null default false,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table k1_field_values (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  field_name text not null,
  raw_value text,
  normalized_value text,
  confidence_score numeric(5,4),
  extraction_method text,
  review_status text not null default 'PENDING',
  reviewer_corrected_value text,
  page_number int,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table k1_reported_distributions (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  tax_year int not null,
  reported_distribution_amount numeric(18,2) not null,
  source_field text not null default '19A',
  confidence_score numeric(5,4),
  review_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table partnership_fmv_snapshots (
  id uuid primary key,
  partnership_id uuid not null references partnerships(id),
  valuation_date date not null,
  fmv_amount numeric(18,2) not null,
  source_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partnership_id, valuation_date)
);

create table partnership_commitments (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  commitment_amount numeric(18,2) not null,
  commitment_date date,
  commitment_start_date date,
  commitment_end_date date,
  status text not null default 'ACTIVE',
  source_type text not null default 'manual',
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table capital_activity_events (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  activity_date date not null,
  event_type text not null,
  amount numeric(18,2) not null,
  source_type text not null default 'manual',
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table k1_issues (
  id uuid primary key,
  k1_document_id uuid not null references k1_documents(id),
  issue_type text not null,
  severity text not null default 'MEDIUM',
  status text not null default 'OPEN',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table partnership_annual_activity (
  id uuid primary key,
  entity_id uuid not null references entities(id),
  partnership_id uuid not null references partnerships(id),
  tax_year int not null,
  interest_amount numeric(18,2),
  dividends_amount numeric(18,2),
  capital_gains_amount numeric(18,2),
  total_income_amount numeric(18,2),
  reported_distribution_amount numeric(18,2),
  k1_capital_account numeric(18,2),
  original_commitment_amount numeric(18,2),
  percent_called numeric(8,4),
  unfunded_amount numeric(18,2),
  paid_in_amount numeric(18,2),
  residual_value_amount numeric(18,2),
  dpi numeric(10,4),
  rvpi numeric(10,4),
  tvpi numeric(10,4),
  irr numeric(10,4),
  ending_gl_balance numeric(18,2),
  source_has_k1 boolean not null default false,
  source_has_capital_activity boolean not null default false,
  source_has_fmv boolean not null default false,
  source_has_manual_input boolean not null default false,
  commitment_source_type text,
  paid_in_source_type text,
  distribution_source_type text,
  residual_value_source_type text,
  return_metrics_source_type text,
  notes text,
  finalized_from_k1_document_id uuid references k1_documents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, partnership_id, tax_year)
);

create table dashboards (
  id uuid primary key,
  name text not null,
  dashboard_type text not null,
  is_shared boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dashboard_widgets (
  id uuid primary key,
  dashboard_id uuid not null references dashboards(id),
  widget_type text not null,
  title text not null,
  position_x int not null default 0,
  position_y int not null default 0,
  width int not null default 4,
  height int not null default 3,
  config_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  event_name text not null,
  object_type text not null,
  object_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
