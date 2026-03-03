import { createHash } from 'node:crypto';
import type { Member, MonthConfig, Slot, Violation } from '../shiftplan/types';
import { solve } from '../shiftplan/solver';
import { getDaysInMonth, isWeekend, isThaiHoliday } from '../shiftplan/dateUtils';
import { compileRuleSet } from './compiler';
import { buildConstraintModel } from './constraintModel';
import { buildScheduleFrame, personLevelsByDay } from './scheduleFrame';
import type { RuleSetV1, SolverInputV2, SolverOutputV2, SlotKey } from './types';
import { buildRuleSetFromWorkspaceConfig } from './legacyAdapter';

const CORE_LEVELS = new Set(['1A', '1B', '2', '3']);

function hasTag(member: Member | undefined, tagId: string): boolean {
  return !!member && !!member.tags?.includes(tagId);
}

function dayClassMatches(dayClass: 'all' | 'weekday' | 'holiday' | 'noon', year: number, month0: number, day: number, noonSet: Set<number>): boolean {
  if (dayClass === 'all') return true;
  if (dayClass === 'noon') return noonSet.has(day);
  const holiday = (isWeekend(year, month0, day) || isThaiHoliday(year, month0, day)) && !noonSet.has(day);
  if (dayClass === 'holiday') return holiday;
  return !holiday;
}

function slotValue(slot: Slot, key: SlotKey): string | null {
  if (key === '1A') return slot.f1 || null;
  if (key === '1B') return slot.f2 || null;
  if (key === '2') return slot.sec || null;
  return slot.thi || null;
}

function toShifts(year: number, month: number, schedule: Record<number, Slot>) {
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

function scheduleArray(resultSchedule: Record<number, Slot>, daysInMonth: number): Slot[] {
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const slot = resultSchedule[d] || { f1: '', f2: '', sec: '', thi: null };
    return {
      f1: slot.f1 || '',
      f2: slot.f2 || '',
      sec: slot.sec || '',
      thi: slot.thi || null,
    };
  });
}

function ensureMandatoryRules(ruleSet: RuleSetV1): RuleSetV1 {
  const hasSingleShiftPerDay = ruleSet.rules.some((r) => r.type === 'single_shift_per_day' && r.enabled);
  if (hasSingleShiftPerDay) return ruleSet;
  return {
    ...ruleSet,
    rules: [
      ...ruleSet.rules,
      {
        id: 'hard-single-shift-per-day',
        name: 'One shift type per person per day',
        type: 'single_shift_per_day',
        enabled: true,
        severity: 'hard',
        scope: 'all_levels',
      },
    ],
  };
}

function validateUniversalRules(
  schedule: Slot[],
  members: Member[],
  ruleSet: RuleSetV1,
  extraAssignmentsByDay: Record<number, Record<string, string>> | undefined,
  year: number,
  month0: number,
  noonSet: Set<number>
): Violation[] {
  const compiled = compileRuleSet(ruleSet);
  const byId = new Map(members.map((m) => [m.id, m]));
  const violations: Violation[] = [];
  const coreByDay = Object.fromEntries(schedule.map((s, idx) => [idx + 1, s])) as Record<number, { f1: string; f2: string; sec: string; thi: string | null }>;
  const frame = buildScheduleFrame(year, month0 + 1, schedule.length, coreByDay, extraAssignmentsByDay);

  for (let d = 1; d <= schedule.length; d++) {
    const slot = schedule[d - 1];
    const assigns: Array<{ key: SlotKey; id: string | null }> = [
      { key: '1A', id: slot.f1 || null },
      { key: '1B', id: slot.f2 || null },
      { key: '2', id: slot.sec || null },
      { key: '3', id: slot.thi || null },
    ];

    for (const assign of assigns) {
      if (!assign.id) continue;
      const eligible = compiled.eligibilityBySlot[assign.key];
      if (!eligible || eligible.size === 0) continue;
      const member = byId.get(assign.id);
      const ok = member?.tags?.some((tag) => eligible.has(tag));
      if (!ok) {
        violations.push({ sev: 'hard', day: d, msg: `${member?.name || assign.id} not eligible for slot ${assign.key}` });
      }
    }
  }

  for (const rule of compiled.hardRules) {
    if (rule.type === 'single_shift_per_day') {
      for (let d = 1; d <= schedule.length; d++) {
        const byPerson = personLevelsByDay(frame, d);
        for (const [personId, levels] of byPerson.entries()) {
          if (levels.length <= 1) continue;
          const personName = byId.get(personId)?.name || personId;
          violations.push({
            sev: 'hard',
            day: d,
            msg: `${personName} assigned multiple shift types on day ${d}: ${levels.join(', ')}`,
          });
        }
      }
    }

    if (rule.type === 'count_limit') {
      for (const member of members) {
        if (!member.tags?.includes(rule.targetTagId)) continue;
        let count = 0;
        for (let d = 1; d <= schedule.length; d++) {
          if (!dayClassMatches(rule.dayClass, year, month0, d, noonSet)) continue;
          const slot = schedule[d - 1];
          const ids = rule.scope === 'slot' && rule.slot
            ? [slotValue(slot, rule.slot)]
            : [slot.f1 || null, slot.f2 || null, slot.sec || null, slot.thi || null];
          if (ids.includes(member.id)) count++;
        }

        if (rule.exact != null && count !== rule.exact) {
          violations.push({ sev: 'hard', day: null, msg: `${member.name} exact=${rule.exact} but got ${count}` });
        }
        if (rule.max != null && count > rule.max) {
          violations.push({ sev: 'hard', day: null, msg: `${member.name} max=${rule.max} but got ${count}` });
        }
        if (rule.min != null && count < rule.min) {
          violations.push({ sev: 'hard', day: null, msg: `${member.name} min=${rule.min} but got ${count}` });
        }
      }
    }

    if (rule.type === 'sequence_gap') {
      const slots: SlotKey[] = rule.slotScope === 'slot' && rule.slot ? [rule.slot] : ['1A', '1B', '2', '3'];
      for (const member of members) {
        if (rule.targetTagId && !member.tags?.includes(rule.targetTagId)) continue;
        let prev: number | null = null;
        for (let d = 1; d <= schedule.length; d++) {
          if (!dayClassMatches(rule.dayClass, year, month0, d, noonSet)) continue;
          const assigned = slots.some((s) => slotValue(schedule[d - 1], s) === member.id);
          if (!assigned) continue;
          if (prev != null && d - prev <= rule.minGapDays) {
            violations.push({ sev: 'hard', day: [prev, d], msg: `${member.name} violates minimum gap ${rule.minGapDays}` });
          }
          prev = d;
        }
      }
    }

    if (rule.type === 'pairing') {
      for (let d = 1; d <= schedule.length; d++) {
        const slot = schedule[d - 1];
        const primaryIds = rule.primarySlots.map((s) => slotValue(slot, s)).filter(Boolean) as string[];
        const counterpartIds = rule.counterpartSlots.map((s) => slotValue(slot, s)).filter(Boolean) as string[];

        const primaryHas = primaryIds.some((id) => hasTag(byId.get(id), rule.primaryTagId));
        const counterpartHas = counterpartIds.some((id) => hasTag(byId.get(id), rule.counterpartTagId));

        if (!primaryHas) continue;
        if (rule.pairing === 'must_pair_with' && !counterpartHas) {
          violations.push({ sev: 'hard', day: d, msg: `${rule.primaryTagId} must pair with ${rule.counterpartTagId}` });
        }
        if (rule.pairing === 'cannot_pair_with' && counterpartHas) {
          violations.push({ sev: 'hard', day: d, msg: `${rule.primaryTagId} cannot pair with ${rule.counterpartTagId}` });
        }
      }
    }
  }

  return violations;
}

export function runUniversalSolve(input: SolverInputV2): SolverOutputV2 {
  const start = Date.now();
  const month0 = input.period.month - 1;
  const daysInMonth = getDaysInMonth(input.period.year, month0);

  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const noonSet = new Set((input.config.noonDays || []).map((d) => d.date));
  const fallback = process.env.USE_UNIVERSAL_SOLVER === 'false';
  const normalizedRuleSet = ensureMandatoryRules(
    input.schedulingConfig
      ? buildRuleSetFromWorkspaceConfig(
        { id: input.workspaceId, name: input.workspaceId, timezone: 'UTC', createdAt: 0, updatedAt: 0 },
        input.schedulingConfig,
        input.legacyConstraints || []
      )
      : input.ruleSet
  );
  const compiled = compileRuleSet(normalizedRuleSet);
  const constraintModel = buildConstraintModel(normalizedRuleSet);
  const extraAssignedByDaySet: Record<number, Set<string>> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    extraAssignedByDaySet[d] = new Set<string>();
    const extra = input.extraAssignmentsByDay?.[d] || {};
    for (const [level, personId] of Object.entries(extra)) {
      if (!personId || personId === '__locked__' || CORE_LEVELS.has(level)) continue;
      extraAssignedByDaySet[d].add(personId);
    }
  }

  const solverResult = solve(input.members, input.config, input.period.year, month0, input.mode, {
    seed,
    extraAssignedByDay: extraAssignedByDaySet,
    fairnessRules: normalizedRuleSet.rules
      .filter((rule: any) => rule?.enabled && rule?.type === 'fairness_balance')
      .map((rule: any): {
        id: string;
        name: string;
        enabled: boolean;
        severity: 'hard' | 'soft';
        scopeType: 'intra_tag' | 'cohort';
        targetTagId?: string;
        memberTagIds?: string[];
        slotScope: Array<'1A' | '1B' | '2' | '3'>;
        metric: 'count';
        dayClass: 'all' | 'holiday' | 'noon';
        hardCapGap?: number;
        softWeight?: number;
      } => ({
        id: String(rule.id || 'fairness'),
        name: String(rule.name || 'Fairness'),
        enabled: true,
        severity: rule.severity === 'hard' ? 'hard' : 'soft',
        scopeType: rule.scopeType === 'cohort' ? 'cohort' : 'intra_tag',
        targetTagId: typeof rule.targetTagId === 'string' ? rule.targetTagId : undefined,
        memberTagIds: Array.isArray(rule.memberTagIds) ? rule.memberTagIds.map(String) : undefined,
        slotScope: Array.isArray(rule.slotScope)
          ? rule.slotScope.filter((s: any) => s === '1A' || s === '1B' || s === '2' || s === '3')
          : [],
        metric: 'count' as const,
        dayClass: rule.dayClass === 'holiday' || rule.dayClass === 'noon' ? rule.dayClass : 'all',
        hardCapGap: Number.isFinite(Number(rule.hardCapGap)) ? Number(rule.hardCapGap) : undefined,
        softWeight: Number.isFinite(Number(rule.softWeight)) ? Number(rule.softWeight) : undefined,
      }))
      .filter((rule: any) => rule.slotScope.length > 0),
    objectiveWeights: constraintModel.objectiveWeights,
  });
  const universalViolations = fallback
    ? []
    : validateUniversalRules(
      scheduleArray(solverResult.schedule, daysInMonth),
      input.members,
      normalizedRuleSet,
      input.extraAssignmentsByDay,
      input.period.year,
      month0,
      noonSet
    );
  const allViolations = [...solverResult.violations, ...universalViolations];
  const needsHardViolationConfirm = allViolations.some((v) => v.sev === 'hard');
  const infeasibilityReasons = Array.from(new Set(
    allViolations.filter((v) => v.sev === 'hard').map((v) => v.msg)
  )).slice(0, 20);

  const inputHash = createHash('sha256')
    .update(JSON.stringify({
      workspaceId: input.workspaceId,
      year: input.period.year,
      month: input.period.month,
      mode: input.mode,
      memberIds: input.members.map((m) => m.id),
      rulesetVersion: normalizedRuleSet.version,
      seed,
    }))
    .digest('hex');
  const replayId = createHash('sha256')
    .update(`${inputHash}:${seed}:${normalizedRuleSet.version}`)
    .digest('hex')
    .slice(0, 16);

  return {
    shifts: toShifts(input.period.year, input.period.month, solverResult.schedule),
    result: solverResult,
    violations: allViolations,
    meta: {
      runtimeMs: Date.now() - start,
      inputHash,
      rulesetVersion: normalizedRuleSet.version,
      configVersion: input.schedulingConfig?.version,
      usedFallback: fallback,
      seed,
      needsHardViolationConfirm,
      compileWarnings: compiled.warnings,
      scoreBreakdown: solverResult.telemetry?.scoreBreakdown || undefined,
      infeasibilityReasons,
      cohortGapViolations: solverResult.telemetry?.cohortGapViolations || undefined,
      replayId,
    },
  };
}
