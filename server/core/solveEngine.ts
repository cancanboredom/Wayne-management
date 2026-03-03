import { solve } from '../../src/lib/shiftplan/solver';
import type { Slot, OffConstraint, MonthConfig, Member } from '../../src/lib/shiftplan/types';
import { DEFAULT_SUBSETS } from '../../src/lib/shiftplan/constants';

export interface SolvePayload {
  year: number;
  month: number;
  mode: 'all' | '2nd3rd';
  seed?: number;
  cumulativeWeights: Record<string, number>;
  existingShifts: Record<number, Slot>;
}

export function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function normalizeSolvePayload(body: any): SolvePayload {
  const year = Number(body?.year);
  const month = Number(body?.month);
  const mode = body?.mode === '2nd3rd' ? '2nd3rd' : 'all';
  const seed = Number.isInteger(body?.seed) ? Number(body.seed) : undefined;
  const cumulativeWeights = body?.cumulativeWeights && typeof body.cumulativeWeights === 'object'
    ? Object.fromEntries(Object.entries(body.cumulativeWeights).filter(([k, v]) => typeof k === 'string' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
    : {};

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

  return { year, month, mode, seed, cumulativeWeights, existingShifts };
}

export function toShiftsFromSchedule(year: number, month: number, schedule: Record<number, Slot>) {
  const shifts: Array<{ date: string; personId: string; level: '1A' | '1B' | '2' | '3' }> = [];
  for (const [dayRaw, slot] of Object.entries(schedule)) {
    const day = Number(dayRaw);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (slot.f1) shifts.push({ date, personId: slot.f1, level: '1A' });
    if (slot.f2) shifts.push({ date, personId: slot.f2, level: '1B' });
    if (slot.sec) shifts.push({ date, personId: slot.sec, level: '2' });
    if (slot.thi) shifts.push({ date, personId: slot.thi, level: '3' });
  }
  return shifts;
}

export function runSolve(payload: SolvePayload, state: any) {
  const rawPeople = Array.isArray(state.people) ? state.people : [];
  const members: Member[] = rawPeople.map((p: any) => ({
    id: p.id,
    name: p.name,
    color: p.color || '#6b7280',
    tags: safeArray(p.tagIds),
    active: true,
    role: p.role || undefined,
    subset: p.subset || undefined,
    group: p.group || undefined,
  }));

  const offConstraints: OffConstraint[] = [];
  for (const p of rawPeople) {
    const dates = safeArray(p.unavailableDates);
    for (const dateStr of dates) {
      const [y, m, d] = String(dateStr).split('-').map(Number);
      if (y === payload.year && m === payload.month) offConstraints.push({ memberId: p.id, date: d, type: 'off' });
    }
  }

  const monthPrefix = `${payload.year}-${String(payload.month).padStart(2, '0')}-`;
  const noonDays = (Array.isArray(state.noonDays) ? state.noonDays : [])
    .filter((date: string) => String(date).startsWith(monthPrefix))
    .map((date: string) => Number(String(date).slice(8, 10)))
    .filter((day: number) => Number.isInteger(day) && day >= 1)
    .map((date: number) => ({ date }));

  const config: MonthConfig = {
    constraints: offConstraints,
    confDays: [],
    noonDays,
    r1picks: {},
    existingShifts: payload.existingShifts,
    subsets: DEFAULT_SUBSETS,
    cumulativeWeights: payload.cumulativeWeights,
  };

  const result = solve(members, config, payload.year, payload.month - 1, payload.mode, { seed: payload.seed });
  const shifts = toShiftsFromSchedule(payload.year, payload.month, result.schedule);
  return {
    shifts,
    stats: result.stats,
    violations: result.violations,
    cost: result.bestC,
    needsHardViolationConfirm: result.violations.some((v: any) => v.sev === 'hard'),
  };
}
