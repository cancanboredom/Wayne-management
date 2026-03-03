import { json } from '../_helpers';
import { readState, writeState } from '../_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const monthKey = String(req.query?.monthKey || req.body?.monthKey || '');
    const code = String(req.body?.code || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
    const expectedCode = `${monthKey.slice(5, 7)}${monthKey.slice(0, 4)}`;
    if (code !== expectedCode) return json(res, 403, { ok: false, error: { message: 'Invalid unlock code' } });

    const { workspaceId, state } = await readState(req);
    if (!state.monthLocks || typeof state.monthLocks !== 'object') state.monthLocks = {};
    delete state.monthLocks[monthKey];
    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { success: true, monthKey } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to unlock month' } });
  }
}
