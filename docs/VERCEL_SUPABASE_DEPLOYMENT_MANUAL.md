# Vercel + Supabase Self-Deployment Manual (Wayne Management 5.3.1)

Last updated: 2026-03-03

This guide shows how to deploy this repo yourself with:
- **Vercel**: frontend + `/api/*` serverless functions
- **Supabase**: database backend

## 1. Prerequisites

- GitHub account (repo pushed)
- Vercel account
- Supabase account
- Node.js 18+ and npm

Local setup:

```bash
npm install
cp .env.example .env.local
```

## 2. Create Supabase Project(s)

Create at least one Supabase project:
- `wayne-prod` (required)
- `wayne-preview` (recommended, avoid using prod DB for preview deployments)

After project creation, open **Project Settings -> API** and keep:
- `Project URL` -> `SUPABASE_URL`
- `anon public` key -> `SUPABASE_ANON_KEY`
- `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

## 3. Apply Database Schema in Supabase

In Supabase **SQL Editor**, run these files in this exact order:

1. [`server/db/supabaseSchema.sql`](/Users/cancaneus_/Desktop/Wayne-management-5.3.1/server/db/supabaseSchema.sql)
2. [`supabase/migrations/0001_wayne6_init.sql`](/Users/cancaneus_/Desktop/Wayne-management-5.3.1/supabase/migrations/0001_wayne6_init.sql)

Why this order matters:
- File 1 creates tables/indexes.
- File 2 enables RLS policies.

## 4. Generate Strong Secrets

Generate secrets locally:

```bash
openssl rand -base64 48
openssl rand -hex 32
```

Use values for:
- `SESSION_SECRET` (base64 one)
- `SOLVER_WORKER_SECRET` (hex one)

## 5. Import Project into Vercel

1. In Vercel: **Add New -> Project**
2. Import this GitHub repo.
3. Keep defaults (repo already has [`vercel.json`](/Users/cancaneus_/Desktop/Wayne-management-5.3.1/vercel.json)):
   - Framework: `vite`
   - Build command: `npm run build:vercel`
   - Output directory: `dist`
4. Deploy once (can fail if env vars not set yet).

## 6. Configure Environment Variables in Vercel

Set these for **Production** (and Preview/Development as needed):

Required for Supabase backend:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

Strongly recommended:
- `SOLVER_WORKER_SECRET`
- `SESSION_TTL_MS=43200000`
- `PREVIEW_READONLY=false` (set `true` only for demo preview projects)

Feature flags:
- `VITE_FF_SUPABASE_BACKEND=true`
- `VITE_FF_AUTH_GATE_V1=false` (or `true` if you want auth gate enabled)
- `VITE_FF_SOLVER_ASYNC=false` (or `true` only if using async solver path)
- `VITE_FF_MOBILE_V2=false` (optional feature toggle)

Optional:
- `GEMINI_API_KEY` (only needed for Smart Import)

Important:
- Never put secrets in `NEXT_PUBLIC_*` or any public variable.
- For Preview deployments, use a separate Supabase project if possible.

## 7. Redeploy and Verify

After env vars are saved, redeploy from Vercel.

Run checks against your deployed URL:

```bash
curl -s https://<your-vercel-domain>/api/health
curl -s https://<your-vercel-domain>/api/ready
curl -s https://<your-vercel-domain>/api/workspaces
```

Expected:
- `/api/health` => `ok: true`
- `/api/ready` => `ok: true` and `ready: true`
- `/api/workspaces` => list of workspaces

## 8. First Login / Access

Default workspace bootstrap path uses a default passcode hash for `123456` when a workspace is first created.

Recommended immediately after go-live:
- Enter app and update passcode from UI (Manage passcode flow).
- Keep `SESSION_SECRET` private and rotate if leaked.

## 9. Data Migration Note (Current Status)

The existing import script [`scripts/import-json-to-supabase.ts`](/Users/cancaneus_/Desktop/Wayne-management-5.3.1/scripts/import-json-to-supabase.ts) is currently **dry-run only** (summary output, no DB writes).

If you need real migration from SQLite to Supabase, implement DB write logic first or migrate manually with SQL.

## 10. Troubleshooting

- `503 Missing env: SUPABASE_URL, SUPABASE_ANON_KEY` on `/api/ready`
  - Missing Vercel env vars in the active environment.

- `Supabase request failed (401/403)`
  - Wrong key or URL, or key copied from wrong Supabase project.

- App deploys but writes are blocked
  - Check `PREVIEW_READONLY`; set `false` for production.

- Data not persisting
  - Ensure `VITE_FF_SUPABASE_BACKEND=true` and Supabase env vars are set.
