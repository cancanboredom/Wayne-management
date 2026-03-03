import { json } from '../../_helpers';
import { getWorkspaceState, saveWorkspaceState } from '../../../server/db/workspaceStateStore';

export default async function handler(req: any, res: any) {
  try {
    const workspaceId = String(req.query?.id || 'default');
    const state = await getWorkspaceState(workspaceId);

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, data: { ruleset: state.ruleset || null } });
    }

    if (req.method === 'PUT') {
      const incoming = req.body?.ruleset;
      if (!incoming || typeof incoming !== 'object') {
        return json(res, 400, { ok: false, error: { message: 'ruleset is required' } });
      }
      state.ruleset = { ...incoming, updatedAt: Date.now() };
      await saveWorkspaceState(workspaceId, state);
      return json(res, 200, { ok: true, data: { ruleset: state.ruleset } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Ruleset failed' } });
  }
}
