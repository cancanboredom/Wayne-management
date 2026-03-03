import { json } from './_helpers';
import { readState } from './_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const { workspaceId, state } = await readState(req);
    return json(res, 200, {
      ok: true,
      data: {
        workspaceId,
        people: state.people,
        shifts: state.shifts,
        manualHighlights: state.manualHighlights,
        noonDays: state.noonDays,
        versions: state.versions,
        constraints: state.constraints,
        ruleset: state.ruleset,
        schedulingConfig: state.schedulingConfig,
      },
    });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to fetch state' } });
  }
}
