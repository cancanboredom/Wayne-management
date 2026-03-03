import { json } from '../../../../_helpers';
import { readState, writeState } from '../../../../_state';

function ensureRoster(state: any, monthKey: string) {
  if (!state.monthRosters || typeof state.monthRosters !== 'object') state.monthRosters = {};
  if (!state.monthRosters[monthKey]) {
    state.monthRosters[monthKey] = {
      monthKey,
      templateId: null,
      overrides: {},
      includedPersonIds: (Array.isArray(state.people) ? state.people : []).map((p: any) => p.id),
      updatedAt: Date.now(),
    };
  }
  return state.monthRosters[monthKey];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const personId = String(req.query?.id || '');
    const monthKey = String(req.query?.monthKey || '');
    const mode = req.body?.mode as 'include' | 'exclude' | 'template';
    if (!['include', 'exclude', 'template'].includes(mode)) {
      return json(res, 400, { ok: false, error: { message: 'mode must be include|exclude|template' } });
    }
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
    }

    const { workspaceId, state } = await readState(req);
    const roster = ensureRoster(state, monthKey);
    const overrides = { ...(roster.overrides || {}) };
    if (mode === 'template') delete overrides[personId];
    else overrides[personId] = mode;

    const peopleIds = new Set((Array.isArray(state.people) ? state.people : []).map((p: any) => p.id));
    const included = new Set(Array.isArray(roster.includedPersonIds) ? roster.includedPersonIds : []);
    if (mode === 'include') included.add(personId);
    if (mode === 'exclude') included.delete(personId);

    roster.overrides = overrides;
    roster.includedPersonIds = Array.from(included).filter((id) => peopleIds.has(id));
    roster.updatedAt = Date.now();
    state.monthRosters[monthKey] = roster;

    if (mode === 'exclude') {
      state.shifts = (Array.isArray(state.shifts) ? state.shifts : []).filter((s: any) => !(s.personId === personId && String(s.date || '').startsWith(monthKey)));
    }

    await writeState(workspaceId, state);
    return json(res, 200, { ok: true, data: { roster } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to update eligibility' } });
  }
}
