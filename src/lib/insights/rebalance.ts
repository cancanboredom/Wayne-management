import type { PersonInsightMetrics, SimulationPlan } from './types';
import { computeFairnessVariance } from './metrics';

export function buildRebalanceSimulation(
    metrics: PersonInsightMetrics[],
    maxSwitches = 2,
): SimulationPlan {
    const included = metrics.filter(m => m.included).sort((a, b) => a.fairnessScore - b.fairnessScore);
    const excluded = metrics.filter(m => !m.included).sort((a, b) => b.fairnessScore - a.fairnessScore);

    const suggestedExcludeIds = included
        .filter(m => m.riskAlerts.length > 0 || m.fairnessScore < 55)
        .slice(0, maxSwitches)
        .map(m => m.personId);
    const suggestedIncludeIds = excluded
        .filter(m => m.fairnessScore >= 65)
        .slice(0, maxSwitches)
        .map(m => m.personId);

    const beforeVariance = computeFairnessVariance(included);
    const simulated = metrics.map(m => {
        if (suggestedExcludeIds.includes(m.personId)) return { ...m, included: false, fairnessScore: Math.min(100, m.fairnessScore + 8) };
        if (suggestedIncludeIds.includes(m.personId)) return { ...m, included: true, fairnessScore: Math.max(0, m.fairnessScore - 3) };
        return m;
    });
    const afterVariance = computeFairnessVariance(simulated.filter(m => m.included));

    let summary = 'ตอนนี้ยังไม่จำเป็นต้องปรับสมดุลรายชื่อ';
    if (suggestedExcludeIds.length || suggestedIncludeIds.length) {
        summary = `คำแนะนำ: พัก ${suggestedExcludeIds.length} คน และหมุนเข้ามา ${suggestedIncludeIds.length} คน`;
    }

    return {
        suggestedExcludeIds,
        suggestedIncludeIds,
        beforeVariance: Number(beforeVariance.toFixed(2)),
        afterVariance: Number(afterVariance.toFixed(2)),
        summary,
    };
}
