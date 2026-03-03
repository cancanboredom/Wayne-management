import { json } from './_helpers';
import { readState, writeState } from './_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    if (!Array.isArray(req.body)) return json(res, 400, { ok: false, error: { message: 'people array is required' } });
    const { workspaceId, state } = await readState(req);
    state.people = req.body;
    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { success: true } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to save people' } });
  }
}
