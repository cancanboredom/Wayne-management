import { isWeekend } from 'date-fns';
import type { Person, Shift } from './shiftplan/types';
import type { SubsetTag } from './shiftplan/types';

export type EligibilityMode = 'include' | 'exclude' | 'template';

export interface RosterTemplate {
  id: string;
  name: string;
  baseIncludedPersonIds: string[];
  isDefault: boolean;
  updatedAt: number;
}

export interface MonthRoster {
  monthKey: string;
  templateId: string | null;
  overrides: Record<string, 'include' | 'exclude'>;
  includedPersonIds: string[];
  updatedAt: number;
}

export interface PersonMonthSummary {
  personId: string;
  total: number;
  weekday: number;
  holiday: number;
  everyOtherDayPairs: number;
  consecutivePairs: number;
  firstCount: number;
  secondCount: number;
  thirdCount: number;
  firstDates: string[];
  secondDates: string[];
  thirdDates: string[];
  noonCount: number;
  noonDates: string[];
}

export interface SummaryGroupDefinition {
  id: string;
  label: string;
  order: number;
  subsetIds: string[];
}

const OTHER_SUMMARY_GROUP: SummaryGroupDefinition = {
  id: 'other',
  label: 'Other',
  order: 9_999,
  subsetIds: [],
};

export function getSummaryGroupDefinitions(subsets: SubsetTag[]): SummaryGroupDefinition[] {
  const grouped = new Map<string, SummaryGroupDefinition>();
  for (const subset of subsets) {
    const id = subset.summaryGroupId || subset.id;
    const label = subset.summaryGroupLabel || subset.displayNameFull || subset.name;
    const order = subset.summaryOrder ?? 9_999;
    if (!grouped.has(id)) {
      grouped.set(id, { id, label, order, subsetIds: [subset.id] });
      continue;
    }
    const current = grouped.get(id)!;
    current.subsetIds.push(subset.id);
    if (order < current.order) current.order = order;
  }
  if (!grouped.has(OTHER_SUMMARY_GROUP.id)) {
    grouped.set(OTHER_SUMMARY_GROUP.id, { ...OTHER_SUMMARY_GROUP });
  }
  return Array.from(grouped.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function getPersonSummaryGroup(person: Person, subsets: SubsetTag[]): SummaryGroupDefinition {
  const bySubset = new Map(subsets.map(s => [s.id, s]));
  for (const tagId of person.tagIds || []) {
    const subset = bySubset.get(tagId);
    if (!subset) continue;
    return {
      id: subset.summaryGroupId || subset.id,
      label: subset.summaryGroupLabel || subset.displayNameFull || subset.name,
      order: subset.summaryOrder ?? 9_999,
      subsetIds: [subset.id],
    };
  }
  return { ...OTHER_SUMMARY_GROUP };
}

export function buildMonthSummary(
  people: Person[],
  shifts: Shift[],
  monthKey: string,
  holidays: string[] = [],
  noonDays: string[] = [],
): Record<string, PersonMonthSummary> {
  const byId: Record<string, PersonMonthSummary> = {};
  for (const p of people) {
    byId[p.id] = {
      personId: p.id,
      total: 0,
      weekday: 0,
      holiday: 0,
      everyOtherDayPairs: 0,
      consecutivePairs: 0,
      firstCount: 0,
      secondCount: 0,
      thirdCount: 0,
      firstDates: [],
      secondDates: [],
      thirdDates: [],
      noonCount: 0,
      noonDates: [],
    };
  }

  const holidaySet = new Set(holidays);
  const noonSet = new Set(noonDays);
  const daysByPerson: Record<string, number[]> = {};
  const noonByPerson = new Map<string, Set<string>>();

  for (const s of shifts) {
    if (!s.date.startsWith(monthKey)) continue;
    const summary = byId[s.personId];
    if (!summary) continue;
    summary.total += 1;
    const d = new Date(`${s.date}T00:00:00`);
    const isHoliday = holidaySet.has(s.date) || isWeekend(d);
    if (isHoliday) summary.holiday += 1;
    else summary.weekday += 1;
    const day = parseInt(s.date.slice(8, 10), 10);
    if (!daysByPerson[s.personId]) daysByPerson[s.personId] = [];
    daysByPerson[s.personId].push(day);

    if (s.level === '1A' || s.level === '1B') {
      summary.firstCount += 1;
      summary.firstDates.push(s.date);
    } else if (s.level === '2') {
      summary.secondCount += 1;
      summary.secondDates.push(s.date);
    } else if (s.level === '3') {
      summary.thirdCount += 1;
      summary.thirdDates.push(s.date);
    }

    // Noon counts should not include 3rd call.
    if (s.level !== '3' && noonSet.has(s.date)) {
      if (!noonByPerson.has(s.personId)) noonByPerson.set(s.personId, new Set<string>());
      noonByPerson.get(s.personId)!.add(s.date);
    }
  }

  for (const [personId, days] of Object.entries(daysByPerson)) {
    const uniq = Array.from(new Set(days)).sort((a, b) => a - b);
    let consecutive = 0;
    let everyOther = 0;
    for (let i = 0; i < uniq.length - 1; i++) {
      if (uniq[i + 1] - uniq[i] === 1) consecutive += 1;
      if (uniq[i + 1] - uniq[i] === 2) everyOther += 1;
    }
    if (byId[personId]) {
      byId[personId].consecutivePairs = consecutive;
      byId[personId].everyOtherDayPairs = everyOther;
    }
  }

  for (const [personId, noonDates] of noonByPerson.entries()) {
    const summary = byId[personId];
    if (!summary) continue;
    summary.noonDates = Array.from(noonDates).sort();
    summary.noonCount = summary.noonDates.length;
  }

  return byId;
}
