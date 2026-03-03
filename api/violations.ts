import { analyzeViolations } from '../src/lib/shiftplan/solver';
import { DEFAULT_SUBSETS } from '../src/lib/shiftplan/constants';
import type { Slot } from '../src/lib/shiftplan/types';
import { getDaysInMonth } from '../src/lib/shiftplan/dateUtils';
import { json } from './_helpers';
import { readState } from './_state';

function normalizeSolveInput(body: any) {
  const year = Number(body?.year);
  const month = Number(body?.month);
  const existingShifts: Record<number, Slot> = {};
  if (body?.existingShifts && typeof body.existingShifts === 'object') {
    for (const [dayKey, rawSlot] of Object.entries(body.existingShifts)) {
      const day = Number(dayKey);
      if (!Number.isInteger(day) || day < 1) continue;
      const slot = (rawSlot && typeof rawSlot === 'object') ? rawSlot as Partial<Slot> : {};
      existingShifts[day] = {
        f1: typeof slot.f1 === 'string' ? slot.f1 : '',
        f2: typeof slot.f2 === 'string' ? slot.f2 : '',
        sec: typeof slot.sec === 'string' ? slot.sec : '',
        thi: typeof slot.thi === 'string' ? slot.thi : null,
      };
    }
  }
  return { year, month, existingShifts };
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const { year, month, existingShifts } = normalizeSolveInput(req.body);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return json(res, 400, { ok: false, error: { message: 'year and month are required' } });

    const { state } = await readState(req);
    const people = Array.isArray(state.people) ? state.people : [];
    const daysInMonth = getDaysInMonth(year, month - 1);

    const offByDay: Record<number, Set<string>> = {};
    for (let d = 1; d <= daysInMonth; d++) offByDay[d] = new Set();

    for (const p of people) {
      for (const dateStr of safeArray(p?.unavailableDates)) {
        const [y, m, d] = String(dateStr).split('-').map(Number);
        if (y === year && m === month && d >= 1 && d <= daysInMonth) offByDay[d].add(p.id);
      }
    }

    const best: Slot[] = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const ex = (existingShifts[d] || { f1: '', f2: '', sec: '', thi: null }) as Slot;
      return {
        f1: ex.f1 === '__locked__' ? '' : (ex.f1 || ''),
        f2: ex.f2 === '__locked__' ? '' : (ex.f2 || ''),
        sec: ex.sec === '__locked__' ? '' : (ex.sec || ''),
        thi: ex.thi === '__locked__' ? null : (ex.thi || null),
      };
    });

    const members = people.map((p: any) => ({ id: p.id, name: p.name, color: p.color || '#6b7280', tags: safeArray(p.tagIds), active: true, role: p.role || undefined, subset: p.subset || undefined, group: p.group || undefined }));
    const violations = analyzeViolations(best, daysInMonth, offByDay, members as any, DEFAULT_SUBSETS);
    return json(res, 200, { ok: true, data: { violations } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to evaluate rules' } });
  }
}
