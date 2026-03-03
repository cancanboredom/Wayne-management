import { json } from '../../_helpers';
import { readState, writeState } from '../../_state';

const SURY_TAGS = ['r1sry', 'r2sry', 'r3sry'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const monthKey = typeof req.body?.monthKey === 'string' ? req.body.monthKey : '';
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });

    const { workspaceId, state } = await readState(req);
    const people = Array.isArray(state.people) ? state.people : [];
    const shifts = (Array.isArray(state.shifts) ? state.shifts : []).filter((s: any) => s?.date?.startsWith(monthKey) && (s.level === '2' || s.level === '3'));
    const current = state.cumulative && typeof state.cumulative === 'object' ? state.cumulative : {};

    for (const p of people) {
      const tagIds = Array.isArray(p?.tagIds) ? p.tagIds : [];
      if (!tagIds.some((t: string) => SURY_TAGS.includes(t))) continue;
      const s = shifts.filter((sh: any) => sh.personId === p.id && sh.level === '2').length;
      const t = shifts.filter((sh: any) => sh.personId === p.id && sh.level === '3').length;
      current[p.id] = {
        name: p.name,
        tagIds,
        months: {
          ...(current[p.id]?.months || {}),
          [monthKey]: { s, t },
        },
      };
    }

    state.cumulative = current;
    await writeState(workspaceId, state);

    return json(res, 200, { ok: true, data: { success: true, data: current, finalizedMonth: monthKey, peopleCount: Object.keys(current).length } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to finalize cumulative month' } });
  }
}
