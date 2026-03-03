import { create } from 'zustand';
import { Person, Shift, Constraint } from '../shiftplan/types';
import type { InsightPriorityPack } from '../insights/priorityPack';

interface LastSolveMeta {
    configVersion?: number;
    compileWarnings?: string[];
    insightPackApplied?: boolean;
    insightPackSize?: number;
}

interface ScheduleState {
    peopleByMonth: Record<string, Person[]>;
    shifts: Shift[];
    constraints: Constraint[]; // Universal constraints array
    lastSolveMeta: LastSolveMeta | null;
    insightPriorityPack: InsightPriorityPack | null;
    setPeopleForMonth: (monthKey: string, people: Person[] | ((prev: Person[]) => Person[])) => void;
    setShifts: (shifts: Shift[]) => void;
    setConstraints: (constraints: Constraint[]) => void;
    setLastSolveMeta: (meta: LastSolveMeta | null) => void;
    setInsightPriorityPack: (pack: InsightPriorityPack | null) => void;
    clearInsightPriorityPackForMonth: (monthKey: string) => void;
}

function sanitizeShifts(input: Shift[]): Shift[] {
    return input.filter((shift) => (
        !!shift
        && typeof shift.date === 'string'
        && shift.date.length > 0
        && typeof shift.level === 'string'
        && shift.level.length > 0
        && typeof shift.personId === 'string'
        && shift.personId.length > 0
    ));
}

export const useScheduleStore = create<ScheduleState>((set) => ({
    peopleByMonth: {},
    shifts: [],
    constraints: [],
    lastSolveMeta: null,
    insightPriorityPack: null,
    setPeopleForMonth: (monthKey, updater) => set((state) => {
        const current = state.peopleByMonth[monthKey] || [];
        const newPeople = typeof updater === 'function' ? updater(current) : updater;
        return {
            peopleByMonth: {
                ...state.peopleByMonth,
                [monthKey]: newPeople
            }
        };
    }),
    setShifts: (shifts) => set({ shifts: sanitizeShifts(shifts) }),
    setConstraints: (constraints) => set({ constraints }),
    setLastSolveMeta: (meta) => set({ lastSolveMeta: meta }),
    setInsightPriorityPack: (pack) => set({ insightPriorityPack: pack }),
    clearInsightPriorityPackForMonth: (monthKey) => set((state) => {
        if (!state.insightPriorityPack || state.insightPriorityPack.monthKey !== monthKey) return state;
        return { insightPriorityPack: null };
    }),
}));
