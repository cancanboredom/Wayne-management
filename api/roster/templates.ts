import { json } from '../_helpers';
import { readState, writeState } from '../_state';

export default async function handler(req: any, res: any) {
  try {
    const { workspaceId, state } = await readState(req);
    if (req.method === 'GET') {
      return json(res, 200, { ok: true, data: { templates: Array.isArray(state.templates) ? state.templates : [] } });
    }
    if (req.method === 'POST') {
      const templates = Array.isArray(req.body?.templates) ? req.body.templates : (Array.isArray(req.body) ? req.body : []);
      state.templates = templates;
      await writeState(workspaceId, state);
      return json(res, 200, { ok: true, data: { templates } });
    }
    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed roster templates op' } });
  }
}
