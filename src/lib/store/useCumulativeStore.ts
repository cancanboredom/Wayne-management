import { create } from 'zustand';

export interface MonthRecord {
    s: number; // 2nd call count
    t: number; // 3rd call count
}

export interface PersonCumulative {
    name: string;
    tagIds: string[];
    months: Record<string, MonthRecord>; // key: 'YYYY-MM'
}

interface CumulativeState {
    data: Record<string, PersonCumulative>; // personId → data
    loaded: boolean;
    setData: (data: Record<string, PersonCumulative>) => void;
    upsertPersonMonth: (
        personId: string,
        monthKey: string,
        record: MonthRecord,
        name: string,
        tagIds: string[]
    ) => void;
    getTotalForPerson: (personId: string) => { s: number; t: number; total: number };
    // Returns deficit map: positive = behind average = higher schedule priority
    getDeficits: () => Record<string, number>;
    // Returns raw cumulative s+t totals for solver weighting
    getCumulativeWeights: () => Record<string, number>;
}

export const useCumulativeStore = create<CumulativeState>((set, get) => ({
    data: {},
    loaded: false,

    setData: (data) => set({ data, loaded: true }),

    upsertPersonMonth: (personId, monthKey, record, name, tagIds) =>
        set(state => ({
            data: {
                ...state.data,
                [personId]: {
                    name,
                    tagIds,
                    months: {
                        ...(state.data[personId]?.months || {}),
                        [monthKey]: record,
                    },
                },
            },
        })),

    getTotalForPerson: (personId) => {
        const person = get().data[personId];
        if (!person) return { s: 0, t: 0, total: 0 };
        const s = Object.values(person.months).reduce((sum, m) => sum + m.s, 0);
        const t = Object.values(person.months).reduce((sum, m) => sum + m.t, 0);
        return { s, t, total: s + t };
    },

    getDeficits: () => {
        const { data, getTotalForPerson } = get();
        const ids = Object.keys(data);
        if (!ids.length) return {};
        const totals = ids.map(id => getTotalForPerson(id).total);
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        const deficits: Record<string, number> = {};
        ids.forEach((id, i) => {
            deficits[id] = parseFloat((avg - totals[i]).toFixed(2));
        });
        return deficits;
    },

    getCumulativeWeights: () => {
        // Use (total - teamAvg) so the scale stays small and blends with current-month counters.
        // Negative = behind average = sorts first in greedy = gets more shifts this month. ✓
        const { data, getTotalForPerson } = get();
        const ids = Object.keys(data);
        if (!ids.length) return {};
        const totals = ids.map(id => getTotalForPerson(id).total);
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        const weights: Record<string, number> = {};
        ids.forEach((id, i) => {
            weights[id] = parseFloat((totals[i] - avg).toFixed(2));
        });
        return weights;
    },
}));
