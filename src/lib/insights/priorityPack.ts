import type { Person } from '../shiftplan/types';
import type { WorkspaceSchedulingConfig } from '../scheduling/types';

export type PriorityBand = 'below_peers' | 'near_peers' | 'above_peers';

export interface InsightPriorityPack {
    monthKey: string;
    createdAt: number;
    source: 'team_insight_assistant';
    medianTotal: number;
    eligibleCount: number;
    weightAdjustments: Record<string, number>;
    bandByPersonId: Record<string, PriorityBand>;
}

interface BuildPriorityPackInput {
    monthKey: string;
    people: Person[];
    includedSet: Set<string>;
    cumulativeTotals: Record<string, number>;
    schedulingConfig: WorkspaceSchedulingConfig | null;
    createdAt?: number;
}

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
}

function isEligibleForSecondOrThirdCall(person: Person, schedulingConfig: WorkspaceSchedulingConfig | null): boolean {
    const tags = person.tagIds || [];
    if (tags.includes('second_call') || tags.includes('third_call')) return true;

    const subsets = schedulingConfig?.subsets || [];
    const eligibleSubsetDefs = subsets.filter((subset) => {
        if (subset.active === false) return false;
        return subset.levelScopes?.includes('2') || subset.levelScopes?.includes('3');
    });
    if (eligibleSubsetDefs.length === 0) return false;

    return eligibleSubsetDefs.some((subset) => {
        if (tags.includes(subset.id)) return true;
        return (subset.tagIds || []).some((tagId) => tags.includes(tagId));
    });
}

function classifyBand(delta: number): PriorityBand {
    if (delta <= -1) return 'below_peers';
    if (delta >= 1) return 'above_peers';
    return 'near_peers';
}

function weightForBand(band: PriorityBand): number {
    if (band === 'below_peers') return -0.8;
    if (band === 'above_peers') return 0.4;
    return 0;
}

export function buildPriorityPack(input: BuildPriorityPackInput): InsightPriorityPack {
    const eligiblePeople = input.people.filter(
        (person) => input.includedSet.has(person.id) && isEligibleForSecondOrThirdCall(person, input.schedulingConfig),
    );
    const totals = eligiblePeople.map((person) => Number(input.cumulativeTotals[person.id] || 0));
    const medianTotal = computeMedian(totals);

    const bandByPersonId: Record<string, PriorityBand> = {};
    const weightAdjustments: Record<string, number> = {};

    for (const person of eligiblePeople) {
        const total = Number(input.cumulativeTotals[person.id] || 0);
        const delta = total - medianTotal;
        const band = classifyBand(delta);
        bandByPersonId[person.id] = band;
        weightAdjustments[person.id] = weightForBand(band);
    }

    return {
        monthKey: input.monthKey,
        createdAt: input.createdAt || Date.now(),
        source: 'team_insight_assistant',
        medianTotal: Number(medianTotal.toFixed(2)),
        eligibleCount: eligiblePeople.length,
        weightAdjustments,
        bandByPersonId,
    };
}

export function mergeCumulativeWeights(
    base: Record<string, number>,
    adjustments: Record<string, number>,
): Record<string, number> {
    const merged: Record<string, number> = { ...base };
    for (const [personId, delta] of Object.entries(adjustments)) {
        const current = Number(merged[personId] || 0);
        merged[personId] = Number((current + Number(delta || 0)).toFixed(2));
    }
    return merged;
}
