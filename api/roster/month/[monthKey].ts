import { json } from '../../_helpers';
import { readState, writeState } from '../../_state';

function resolveMonthRoster(state: any, monthKey: string) {
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
  try {
    const monthKey = String(req.query?.monthKey || '');
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
    }

    const { workspaceId, state } = await readState(req);
    const roster = resolveMonthRoster(state, monthKey);

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, data: { roster } });
    }

    if (req.method === 'POST') {
      const next = {
        ...roster,
        monthKey,
        templateId: typeof req.body?.templateId === 'string' ? req.body.templateId : roster.templateId,
        overrides: req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : roster.overrides,
        includedPersonIds: Array.isArray(req.body?.includedPersonIds) ? req.body.includedPersonIds : roster.includedPersonIds,
        updatedAt: Date.now(),
      };
      state.monthRosters[monthKey] = next;
      await writeState(workspaceId, state);
      return json(res, 200, { ok: true, data: { roster: next } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed month roster op' } });
  }
}
