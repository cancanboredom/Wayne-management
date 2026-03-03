import { json } from '../../_helpers';
import { getWorkspaceState, saveWorkspaceState } from '../../../server/db/workspaceStateStore';

const DEFAULT_CONFIG = {
  version: 1,
  updatedAt: Date.now(),
  subsets: [],
};

export default async function handler(req: any, res: any) {
  try {
    const workspaceId = String(req.query?.id || 'default');
    const state = await getWorkspaceState(workspaceId);

    if (req.method === 'GET') {
      if (!state.schedulingConfig) state.schedulingConfig = DEFAULT_CONFIG;
      return json(res, 200, { ok: true, data: { config: state.schedulingConfig } });
    }

    if (req.method === 'PUT') {
      const incoming = req.body?.config;
      if (!incoming || typeof incoming !== 'object') {
        return json(res, 400, { ok: false, error: { message: 'config is required' } });
      }
      state.schedulingConfig = { ...incoming, updatedAt: Date.now() };
      await saveWorkspaceState(workspaceId, state);
      return json(res, 200, { ok: true, data: { config: state.schedulingConfig } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Scheduling config failed' } });
  }
}
