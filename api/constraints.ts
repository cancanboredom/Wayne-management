import { json } from './_helpers';
import { readState, writeState } from './_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const constraints = Array.isArray(req.body) ? req.body : [];
    const { workspaceId, state } = await readState(req);
    state.constraints = constraints;
    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { success: true } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to save constraints' } });
  }
}
