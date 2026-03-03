import { json } from './_helpers';
import { readState, writeState } from './_state';

export default async function handler(req: any, res: any) {
  try {
    const { workspaceId, state } = await readState(req);

    if (req.method === 'GET') {
      const monthKey = typeof req.query?.monthKey === 'string' ? req.query.monthKey : '';
      const list = Array.isArray(state.versions) ? state.versions : [];
      const versions = monthKey ? list.filter((v: any) => v?.month === monthKey) : list;
      versions.sort((a: any, b: any) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
      return json(res, 200, { ok: true, data: { versions } });
    }

    if (req.method === 'POST') {
      const payload = req.body;
      if (Array.isArray(payload)) {
        state.versions = payload;
        await writeState(workspaceId, state);
        return json(res, 200, { ok: true, data: { success: true, mode: 'all' } });
      }

      const monthKey = typeof payload?.monthKey === 'string' ? payload.monthKey : '';
      const versions = Array.isArray(payload?.versions) ? payload.versions : [];
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });
      }
      const current = Array.isArray(state.versions) ? state.versions : [];
      state.versions = current.filter((v: any) => v?.month !== monthKey).concat(versions.map((v: any) => ({ ...v, month: monthKey })));
      await writeState(workspaceId, state);
      return json(res, 200, { ok: true, data: { success: true, mode: 'month', monthKey, count: versions.length } });
    }

    return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to handle versions' } });
  }
}
