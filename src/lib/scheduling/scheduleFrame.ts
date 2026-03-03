import type { ShiftLevel } from '../shiftplan/types';
import type { ScheduleFrame, ScheduleFrameCell } from './types';

const CORE_LEVELS: ShiftLevel[] = ['1A', '1B', '2', '3'];

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildScheduleFrame(
  year: number,
  month: number,
  daysInMonth: number,
  coreByDay: Record<number, { f1: string; f2: string; sec: string; thi: string | null }>,
  extraAssignmentsByDay?: Record<number, Record<string, string>>
): ScheduleFrame {
  const levels = new Set<string>(CORE_LEVELS);
  for (const extra of Object.values(extraAssignmentsByDay || {})) {
    for (const level of Object.keys(extra || {})) levels.add(level);
  }

  const byDay: ScheduleFrame['byDay'] = {};
  for (let d = 1; d <= daysInMonth; d++) {
    byDay[d] = {};
    const core = coreByDay[d] || { f1: '', f2: '', sec: '', thi: null };
    const extra = extraAssignmentsByDay?.[d] || {};
    for (const level of levels) {
      let personId: string | null = null;
      if (level === '1A') personId = core.f1 || null;
      else if (level === '1B') personId = core.f2 || null;
      else if (level === '2') personId = core.sec || null;
      else if (level === '3') personId = core.thi || null;
      else personId = extra[level] || null;

      const cell: ScheduleFrameCell = {
        date: dateStr(year, month, d),
        day: d,
        level,
        personId,
        locked: personId === '__locked__',
      };
      byDay[d][level] = cell;
    }
  }

  return {
    year,
    month,
    daysInMonth,
    levels: Array.from(levels),
    byDay,
  };
}

export function personLevelsByDay(frame: ScheduleFrame, day: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const cells = frame.byDay[day] || {};
  for (const cell of Object.values(cells)) {
    if (!cell.personId || cell.personId === '__locked__') continue;
    if (!out.has(cell.personId)) out.set(cell.personId, []);
    out.get(cell.personId)!.push(cell.level);
  }
  return out;
}
