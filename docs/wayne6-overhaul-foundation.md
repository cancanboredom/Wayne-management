# Wayne 6.0 Overhaul Foundation

This repository now includes phase-1 foundation for the Wayne 6.0 architecture migration:

## Added foundations

- Feature flags (`src/config/flags.ts`)
  - `VITE_FF_SUPABASE_BACKEND`
  - `VITE_FF_AUTH_GATE_V1`
  - `VITE_FF_SOLVER_ASYNC`
  - `VITE_FF_MOBILE_V2`
- Typed API client scaffolding (`src/api/client/*`)
- Vercel API route scaffolding (`api/*`)
  - `GET /api/health`
  - `GET /api/ready`
  - `POST /api/auth/unlock`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `POST /api/solver/jobs`
  - `GET /api/solver/jobs/:id`
  - `POST /api/solver/jobs/:id/cancel`
  - `POST /api/solver/worker`
- Auth/session utilities (`server/auth/session.ts`)
- Supabase-backed solver job service with in-memory fallback (`server/solver/jobs.ts`)
- Supabase SQL baseline (`server/db/supabaseSchema.sql`)
- Supabase RLS migration starter (`supabase/migrations/0001_wayne6_init.sql`)
- Migration script stubs
  - `npm run db:export:sqlite`
  - `npm run db:import:supabase`
- Vercel config (`vercel.json`)
- Mobile shell V2 foundation
  - Bottom-tab nav enabled by `VITE_FF_MOBILE_V2=true`

## Current status

This is a broad implementation pass, not the final production hardening state yet.

- Existing Express + SQLite flow still works as fallback.
- New Vercel API routes now cover the core frontend paths used by current UI.
- Supabase workspace-state storage is wired through REST API client with in-memory fallback.

## Next implementation milestones

1. Configure periodic trigger for `/api/solver/worker` (Vercel Cron or external scheduler).
2. Finalize passcode rotation/change endpoint and admin controls.
3. Remove Firebase and SQLite write path after parity verification in staging.
4. Add richer observability dashboards (job latency/error trends).
