import type { Person } from '../shiftplan/types';
import type { PersonMonthSummary } from '../roster';
import type { PersonInsightMetrics, RiskAlert } from './types';

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
    if (values.length <= 1) return 0;
    const avg = average(values);
    return values.reduce((sum, v) => sum + (v - avg) * (v - avg), 0) / values.length;
}

export function deriveRiskAlertsFromSummary(personId: string, summary: PersonMonthSummary): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    if (summary.consecutivePairs > 0) {
        alerts.push({
            personId,
            kind: 'consecutive',
            severity: summary.consecutivePairs >= 2 ? 'high' : 'medium',
            message: `Too many consecutive pairings (${summary.consecutivePairs})`,
        });
    }
    if (summary.everyOtherDayPairs > 1) {
        alerts.push({
            personId,
            kind: 'alternate',
            severity: summary.everyOtherDayPairs >= 3 ? 'high' : 'medium',
            message: `Too many alternate-day pairings (${summary.everyOtherDayPairs})`,
        });
    }
    if (summary.noonCount >= Math.max(3, Math.ceil(summary.total * 0.4))) {
        alerts.push({
            personId,
            kind: 'noon_heavy',
            severity: summary.noonCount >= Math.max(5, Math.ceil(summary.total * 0.55)) ? 'high' : 'medium',
            message: `Noon shifts are heavy (${summary.noonCount})`,
        });
    }
    if (summary.holiday > summary.weekday && summary.total > 0) {
        alerts.push({
            personId,
            kind: 'holiday_heavy',
            severity: summary.holiday >= summary.weekday + 2 ? 'high' : 'low',
            message: `Holiday load is high (${summary.holiday}/${summary.total})`,
        });
    }
    return alerts;
}

export function buildPersonInsightMetrics(
    people: Person[],
    summaryById: Record<string, PersonMonthSummary>,
    includedSet: Set<string>,
): PersonInsightMetrics[] {
    const summaries = people.map(person => summaryById[person.id]).filter(Boolean);
    const avgWeekday = average(summaries.map(s => s.weekday));
    const avgHoliday = average(summaries.map(s => s.holiday));
    const avgNoon = average(summaries.map(s => s.noonCount));
    const avgAlternate = average(summaries.map(s => s.everyOtherDayPairs));
    const avgConsecutive = average(summaries.map(s => s.consecutivePairs));

    return people.map(person => {
        const s = summaryById[person.id] || {
            personId: person.id,
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

        const fairness = {
            weekdayGap: avgWeekday === 0 ? 0 : (s.weekday - avgWeekday) / Math.max(avgWeekday, 1),
            holidayGap: avgHoliday === 0 ? 0 : (s.holiday - avgHoliday) / Math.max(avgHoliday, 1),
            noonGap: avgNoon === 0 ? 0 : (s.noonCount - avgNoon) / Math.max(avgNoon, 1),
            alternatePressure: avgAlternate === 0 ? s.everyOtherDayPairs : (s.everyOtherDayPairs - avgAlternate) / Math.max(avgAlternate, 1),
            consecutivePressure: avgConsecutive === 0 ? s.consecutivePairs : (s.consecutivePairs - avgConsecutive) / Math.max(avgConsecutive, 1),
        };
        const absSum = Math.abs(fairness.weekdayGap)
            + Math.abs(fairness.holidayGap)
            + Math.abs(fairness.noonGap)
            + Math.abs(fairness.alternatePressure)
            + Math.abs(fairness.consecutivePressure);
        const fairnessScore = Math.max(0, 100 - (absSum * 18));

        return {
            personId: person.id,
            name: person.name,
            included: includedSet.has(person.id),
            total: s.total,
            weekday: s.weekday,
            holiday: s.holiday,
            noon: s.noonCount,
            alternatePairs: s.everyOtherDayPairs,
            consecutivePairs: s.consecutivePairs,
            fairnessScore: Number(fairnessScore.toFixed(1)),
            fairness,
            riskAlerts: deriveRiskAlertsFromSummary(person.id, s),
        };
    });
}

export function computeFairnessVariance(metrics: PersonInsightMetrics[]): number {
    return variance(metrics.map(m => m.fairnessScore));
}
