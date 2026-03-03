import { format, subMonths } from 'date-fns';
import type { Person, Shift } from '../shiftplan/types';
import { buildMonthSummary, type PersonMonthSummary } from '../roster';
import type { ForecastResult, PersonTimelinePoint } from './types';

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function slope(values: number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    const xs = values.map((_, i) => i + 1);
    const xAvg = average(xs);
    const yAvg = average(values);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i] - xAvg) * (values[i] - yAvg);
        den += (xs[i] - xAvg) * (xs[i] - xAvg);
    }
    return den === 0 ? 0 : num / den;
}

export function getRecentMonthKeys(monthCount: number): string[] {
    const keys: string[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
        keys.push(format(subMonths(new Date(), i), 'yyyy-MM'));
    }
    return keys;
}

export function buildSummaryHistory(
    people: Person[],
    shifts: Shift[],
    holidays: string[],
    noonDays: string[],
    monthCount = 6,
): Record<string, Record<string, PersonMonthSummary>> {
    const monthKeys = getRecentMonthKeys(monthCount);
    const history: Record<string, Record<string, PersonMonthSummary>> = {};
    for (const mk of monthKeys) {
        history[mk] = buildMonthSummary(people, shifts, mk, holidays, noonDays);
    }
    return history;
}

export function buildForecastResults(
    people: Person[],
    includedSet: Set<string>,
    history: Record<string, Record<string, PersonMonthSummary>>,
): ForecastResult[] {
    const monthKeys = Object.keys(history).sort();
    return people.map(person => {
        const points = monthKeys.map(mk => history[mk]?.[person.id]).filter(Boolean);
        const totals = points.map(p => p.total);
        const holidays = points.map(p => p.holiday);
        const noons = points.map(p => p.noonCount);
        const avgTotal = average(totals);
        const totalSlope = slope(totals);
        const projected = Math.max(0, avgTotal + totalSlope);
        const spread = Math.max(1, Math.round(Math.max(1, projected * 0.2)));
        const expectedMin = Math.max(0, Math.round(projected - spread));
        const expectedMax = Math.max(expectedMin, Math.round(projected + spread));
        const expectedHoliday = Math.max(0, Math.round(average(holidays)));
        const expectedNoon = Math.max(0, Math.round(average(noons)));

        let confidence: ForecastResult['confidence'] = 'high';
        if (points.length < 4) confidence = 'medium';
        if (points.length < 2) confidence = 'low';

        let status: ForecastResult['status'] = 'stable';
        if (totalSlope >= 0.8 || projected >= avgTotal + 2) status = 'likely_overload';
        else if (totalSlope <= -0.8 || projected <= Math.max(0, avgTotal - 2)) status = 'likely_underload';

        return {
            personId: person.id,
            name: person.name,
            included: includedSet.has(person.id),
            expectedMin,
            expectedMax,
            expectedHoliday,
            expectedNoon,
            confidence,
            status,
        };
    });
}

export function buildPersonTimeline(
    personId: string,
    history: Record<string, Record<string, PersonMonthSummary>>,
): PersonTimelinePoint[] {
    return Object.keys(history)
        .sort()
        .map(monthKey => {
            const summary = history[monthKey]?.[personId];
            const total = summary?.total || 0;
            const raw = summary || {
                firstCount: 0,
                secondCount: 0,
                thirdCount: 0,
                noonCount: 0,
                everyOtherDayPairs: 0,
                consecutivePairs: 0,
                weekday: 0,
                holiday: 0,
            };
            const fairnessPenalty = raw.everyOtherDayPairs * 8 + raw.consecutivePairs * 12 + Math.abs(raw.holiday - raw.weekday) * 2;
            const fairnessScore = Math.max(0, 100 - fairnessPenalty - Math.max(0, total - 6) * 4);
            return {
                monthKey,
                firstCount: raw.firstCount,
                secondCount: raw.secondCount,
                thirdCount: raw.thirdCount,
                noonCount: raw.noonCount,
                fairnessScore: Number(fairnessScore.toFixed(1)),
                alternatePressure: raw.everyOtherDayPairs,
            };
        });
}
