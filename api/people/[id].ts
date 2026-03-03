import { json } from '../_helpers';
import { readState, writeState } from '../_state';

function buildDeleteImpact(personId: string, shifts: Array<{ date: string; personId: string; level: string }>) {
  const impactedShifts = shifts.filter((s) => s.personId === personId);
  const affectedMonths = Array.from(new Set(impactedShifts.map((s) => String(s.date).slice(0, 7)))).sort();
  const affectedByLevel = {
    '1A': impactedShifts.filter((s) => s.level === '1A').length,
    '1B': impactedShifts.filter((s) => s.level === '1B').length,
    '2': impactedShifts.filter((s) => s.level === '2').length,
    '3': impactedShifts.filter((s) => s.level === '3').length,
  };
  const affectedDatesSample = Array.from(new Set(impactedShifts.map((s) => s.date))).sort().slice(0, 8);
  return {
    impactedShifts,
    preview: {
      removedShiftCount: impactedShifts.length,
      affectedMonths,
      affectedByLevel,
      affectedDatesSample,
      warnings: impactedShifts.length > 0 ? ['ย้ายบุคลากรออกแล้ว เวรที่ผูกกับคนนี้จะถูกถอดออกจากตารางปัจจุบัน'] : [],
    },
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'DELETE') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const personId = String(req.query?.id || '');
    const mode = typeof req.query?.mode === 'string' ? req.query.mode : 'soft';
    const previewOnly = req.query?.preview === '1';

    const { workspaceId, state } = await readState(req);
    const people = Array.isArray(state.people) ? state.people : [];
    const shifts = Array.isArray(state.shifts) ? state.shifts : [];
    const targetPerson = people.find((p: any) => p.id === personId);
    if (!targetPerson) return json(res, 404, { ok: false, error: { message: 'Person not found' } });

    const { preview } = buildDeleteImpact(personId, shifts);
    if (previewOnly) return json(res, 200, { ok: true, data: { preview, mode } });

    state.people = people.filter((p: any) => p.id !== personId);
    state.shifts = shifts.filter((s: any) => s.personId !== personId);
    await writeState(workspaceId, state);

    return json(res, 200, { ok: true, data: { success: true, mode, preview, people: state.people, shifts: state.shifts } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to delete person' } });
  }
}
