import { json } from '../_helpers';
import { readState, writeState } from '../_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const monthKey = typeof req.body?.monthKey === 'string' ? req.body.monthKey : '';
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
    }
    const { workspaceId, state } = await readState(req);
    state.shifts = (Array.isArray(state.shifts) ? state.shifts : []).filter((s: any) => !String(s.date || '').startsWith(monthKey));
    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { success: true, monthKey, shifts: state.shifts } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to clear month shifts' } });
  }
}
