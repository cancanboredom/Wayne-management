-- Wayne 6.0 schema (initial draft). Apply via Supabase SQL editor or migration pipeline.

create table if not exists workspaces (
  id text primary key,
  name text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_access (
  workspace_id text primary key references workspaces(id) on delete cascade,
  passcode_hash text not null,
  policy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists workspace_state (
  workspace_id text primary key references workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists people (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  color text,
  role text,
  subset text,
  group_name text,
  unavailable_dates jsonb not null default '[]'::jsonb,
  tag_ids jsonb not null default '[]'::jsonb,
  target_total integer,
  target_holiday integer,
  target_weekday integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists shifts (
  workspace_id text not null references workspaces(id) on delete cascade,
  date date not null,
  person_id text not null,
  level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, date, person_id, level)
);

create table if not exists solver_jobs (
  id uuid primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_usage (
  usage_date text not null,
  endpoint text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_date, endpoint)
);

create index if not exists idx_shifts_workspace_date on shifts (workspace_id, date);
create index if not exists idx_solver_jobs_status_created on solver_jobs (status, created_at);
