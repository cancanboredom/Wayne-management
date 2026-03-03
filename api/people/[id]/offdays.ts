import { json } from '../../_helpers';
import { readState, writeState } from '../../_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const personId = String(req.query?.id || '');
    const unavailableDates = Array.isArray(req.body?.unavailableDates) ? req.body.unavailableDates : null;
    if (!unavailableDates) return json(res, 400, { ok: false, error: { message: 'unavailableDates array is required' } });

    const { workspaceId, state } = await readState(req);
    const people = Array.isArray(state.people) ? state.people : [];
    state.people = people.map((p: any) => (p.id === personId ? { ...p, unavailableDates } : p));
    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { success: true, people: state.people } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to update offdays' } });
  }
}
