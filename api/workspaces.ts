import { randomUUID } from 'node:crypto';
import { json } from './_helpers';
import { createWorkspaceStore, listWorkspacesStore } from '../server/db/workspaceStateStore';

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const workspaces = await listWorkspacesStore();
      return json(res, 200, { ok: true, data: { workspaces } });
    }

    if (req.method === 'POST') {
      const name = String(req.body?.name || '').trim();
      const timezone = String(req.body?.timezone || 'UTC').trim();
      if (!name) return json(res, 400, { ok: false, error: { message: 'name is required' } });
      const id = String(req.body?.id || `ws_${randomUUID().slice(0, 8)}`);
      const workspace = await createWorkspaceStore({ id, name, timezone });
      return json(res, 200, { ok: true, data: { workspace } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to handle workspaces' } });
  }
}
