-- Wayne 6.0 base migration
-- Apply server/db/supabaseSchema.sql first, then run this file for RLS policies.

-- RLS baseline (requires auth.jwt claim workspace_id)
alter table if exists people enable row level security;
alter table if exists shifts enable row level security;
alter table if exists solver_jobs enable row level security;
alter table if exists workspace_state enable row level security;

create policy if not exists people_workspace_scope on people
  using (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''))
  with check (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''));

create policy if not exists shifts_workspace_scope on shifts
  using (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''))
  with check (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''));

create policy if not exists solver_jobs_workspace_scope on solver_jobs
  using (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''))
  with check (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''));

create policy if not exists workspace_state_workspace_scope on workspace_state
  using (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''))
  with check (workspace_id = coalesce((auth.jwt() ->> 'workspace_id')::text, ''));
