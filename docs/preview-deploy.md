# Railway Public Preview Deployment

Use this guide to publish a single public preview URL for new users without running `localhost`.

## 1. Connect GitHub to Railway

1. Create a new project in Railway.
2. Choose **Deploy from GitHub repo** and select this repository.
3. Set the deployment branch to `main`.
4. Enable auto deploy on push.

## 2. Configure Runtime

This repository includes [`railway.json`](../railway.json) with:

- build: `npm run build`
- start: `npm run start`
- health check: `/api/health`

Railway will use these automatically.

## 3. Set Environment Variables

In Railway service variables, set:

- `NODE_ENV=production`
- `PREVIEW_READONLY=true`
- `GEMINI_API_KEY=<optional>`

Notes:

- `PORT` is provided by Railway automatically.
- When `PREVIEW_READONLY=true`, all write APIs (`POST/PUT/PATCH/DELETE /api/*`) return `403` with `code: PREVIEW_READONLY`.

## 4. Persistent SQLite Storage

Attach a Railway volume and keep `wayne_duty.db` on persistent storage so app data survives restarts.

## 5. Verify After Deploy

1. Open `<your-railway-url>/api/health` and confirm response is `{ "status": "ok" }`.
2. Open the app URL on desktop and mobile.
3. Confirm visual read-only indicators:
   - Sidebar badge: `Preview Read only`
   - Top banner: preview/read-only explanation
4. Confirm mutation controls are disabled (not only blocked after click):
   - Calendar: Generate / Save / Clear / template mutation
   - Personnel: Add / Edit / Delete / Apply import / eligibility mutation
   - Settings: Add tag / add-save-delete rules
5. Optional fallback check: try forcing a write API and confirm `403` + `code: PREVIEW_READONLY`.

## Troubleshooting

- Deploy fails at build:
  - Check build logs for `npm run build`.
  - Confirm `npm ci` succeeds locally.
- App starts but API fails:
  - Check `NODE_ENV=production`.
  - Confirm health check path is `/api/health`.
- Users can still write data:
  - Confirm `PREVIEW_READONLY=true` on Railway service variables and redeploy.
