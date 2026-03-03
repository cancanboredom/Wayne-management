import { json } from '../../_helpers';
import { readState, writeState } from '../../_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const versionId = String(req.query?.versionId || '');
    const monthKey = typeof req.body?.monthKey === 'string' ? req.body.monthKey : '';
    const dryRun = req.body?.dryRun === true;
    const conflictMode = req.body?.conflictMode === 'overwrite' ? 'overwrite' : 'skip';
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return json(res, 400, { ok: false, error: { message: 'monthKey must be YYYY-MM' } });

    const { workspaceId, state } = await readState(req);
    const versions = Array.isArray(state.versions) ? state.versions : [];
    const version = versions.find((v: any) => v.id === versionId);
    if (!version) return json(res, 404, { ok: false, error: { message: 'Version not found' } });

    const allShifts = Array.isArray(state.shifts) ? state.shifts : [];
    const currentMonth = allShifts.filter((s: any) => String(s.date || '').startsWith(monthKey));
    const otherMonths = allShifts.filter((s: any) => !String(s.date || '').startsWith(monthKey));
    const incoming = Array.isArray(version.shifts) ? version.shifts.filter((s: any) => String(s.date || '').startsWith(monthKey)) : [];

    const bySlot = new Map<string, any>();
    for (const s of currentMonth) bySlot.set(`${s.date}|${s.level}`, s);
    const conflicts: Array<{ date: string; level: string; existingPersonId: string; incomingPersonId: string }> = [];
    for (const s of incoming) {
      const key = `${s.date}|${s.level}`;
      const existing = bySlot.get(key);
      if (existing && existing.personId !== s.personId) {
        conflicts.push({ date: s.date, level: s.level, existingPersonId: existing.personId, incomingPersonId: s.personId });
      }
    }

    if (dryRun) {
      return json(res, 200, {
        ok: true,
        data: {
          success: true,
          dryRun: true,
          requiresConflictResolution: conflicts.length > 0,
          conflicts,
          summary: {
            restoredPeopleCount: 0,
            restoredShiftCount: 0,
            skippedConflictCount: conflicts.length,
            overwrittenCount: 0,
            monthKey,
          },
        },
      });
    }

    const monthBySlot = new Map<string, any>();
    for (const s of currentMonth) monthBySlot.set(`${s.date}|${s.level}`, s);
    let restoredShiftCount = 0;
    let overwrittenCount = 0;
    let skippedConflictCount = 0;

    for (const s of incoming) {
      const key = `${s.date}|${s.level}`;
      const existing = monthBySlot.get(key);
      if (!existing) {
        monthBySlot.set(key, s);
        restoredShiftCount += 1;
        continue;
      }
      if (existing.personId === s.personId) continue;
      if (conflictMode === 'overwrite') {
        monthBySlot.set(key, s);
        restoredShiftCount += 1;
        overwrittenCount += 1;
      } else {
        skippedConflictCount += 1;
      }
    }

    const merged = [...otherMonths, ...Array.from(monthBySlot.values())];
    state.shifts = merged;
    await writeState(workspaceId, state);

    return json(res, 200, {
      ok: true,
      data: {
        success: true,
        people: Array.isArray(state.people) ? state.people : [],
        shifts: merged,
        conflicts,
        summary: {
          restoredPeopleCount: 0,
          restoredShiftCount,
          skippedConflictCount,
          overwrittenCount,
          monthKey,
        },
      },
    });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to restore version' } });
  }
}
