import { json } from '../../_helpers';
import { readState, writeState } from '../../_state';

const SURY_TAGS = ['r1sry', 'r2sry', 'r3sry'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const { workspaceId, state } = await readState(req);
    const people = Array.isArray(state.people) ? state.people : [];
    const shifts = (Array.isArray(state.shifts) ? state.shifts : []).filter((s: any) => s.level === '2' || s.level === '3');
    const rebuilt: Record<string, any> = {};

    for (const p of people) {
      const tagIds = Array.isArray(p?.tagIds) ? p.tagIds : [];
      if (!tagIds.some((t: string) => SURY_TAGS.includes(t))) continue;
      const personShifts = shifts.filter((s: any) => s.personId === p.id);
      const months: Record<string, { s: number; t: number }> = {};
      for (const sh of personShifts) {
        const mk = String(sh.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(mk)) continue;
        if (!months[mk]) months[mk] = { s: 0, t: 0 };
        if (sh.level === '2') months[mk].s += 1;
        if (sh.level === '3') months[mk].t += 1;
      }
      rebuilt[p.id] = { name: p.name, tagIds, months };
    }

    state.cumulative = rebuilt;
    await writeState(workspaceId, state);

    return json(res, 200, { ok: true, data: { success: true, data: rebuilt, rebuiltPeople: Object.keys(rebuilt).length } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to rebuild cumulative data' } });
  }
}
