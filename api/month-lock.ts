import { json } from './_helpers';
import { readState, writeState } from './_state';

function getLock(state: any, monthKey: string) {
  const locks = state.monthLocks && typeof state.monthLocks === 'object' ? state.monthLocks : {};
  return locks[monthKey] || null;
}

export default async function handler(req: any, res: any) {
  try {
    const monthKey = String(req.query?.monthKey || req.body?.monthKey || '');
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
    const { workspaceId, state } = await readState(req);

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, data: { locked: getLock(state, monthKey) } });
    }

    if (req.method === 'POST') {
      const versionId = String(req.body?.versionId || '');
      if (!versionId) return json(res, 400, { ok: false, error: { message: 'versionId is required' } });
      const version = (Array.isArray(state.versions) ? state.versions : []).find((v: any) => v.id === versionId);
      if (!version) return json(res, 404, { ok: false, error: { message: 'Version not found' } });
      if (!state.monthLocks || typeof state.monthLocks !== 'object') state.monthLocks = {};
      const people = (Array.isArray(state.people) ? state.people : []).map((p: any) => ({ personId: p.id, name: p.name, color: p.color ?? null, role: p.role ?? null, subset: p.subset ?? null, tagIds: p.tagIds || [] }));
      state.monthLocks[monthKey] = {
        workspaceId,
        monthKey,
        versionId,
        shifts: Array.isArray(version.shifts) ? version.shifts : [],
        people,
        lockedAt: Date.now(),
      };
      await writeState(workspaceId, state);
      return json(res, 200, { ok: true, data: { success: true, locked: state.monthLocks[monthKey] } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Month lock failed' } });
  }
}
