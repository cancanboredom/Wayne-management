import { json } from './_helpers';
import { readState, writeState } from './_state';

function findConflicts(shifts: Array<{ date: string; personId: string; level: string }>) {
  const byDatePerson = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!s?.date || !s?.personId || !s?.level || s.personId === '__locked__') continue;
    const key = `${s.date}|${s.personId}`;
    if (!byDatePerson.has(key)) byDatePerson.set(key, new Set());
    byDatePerson.get(key)!.add(s.level);
  }
  const conflicts: string[] = [];
  for (const [key, levels] of byDatePerson.entries()) {
    if (levels.size > 1) {
      const [date, personId] = key.split('|');
      conflicts.push(`${personId} has multiple levels on ${date}: ${Array.from(levels).join(', ')}`);
    }
  }
  return conflicts;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const incoming = Array.isArray(req.body) ? req.body : [];
    const { workspaceId, state } = await readState(req);
    const validIds = new Set((state.people || []).map((p: any) => p.id));
    const shifts = incoming.filter((s: any) => s?.personId === '__locked__' || validIds.has(s?.personId));
    const conflicts = findConflicts(shifts);
    if (conflicts.length > 0) {
      return json(res, 400, {
        ok: false,
        error: { message: 'A person can only hold one shift type per day.', details: conflicts },
      });
    }
    state.shifts = shifts;
    await writeState(workspaceId, state);
    return json(res, 200, {
      ok: true,
      data: { success: true, droppedUnknownPeople: Math.max(0, incoming.length - shifts.length) },
    });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to save shifts' } });
  }
}
