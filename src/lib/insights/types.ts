export type RiskKind = 'consecutive' | 'alternate' | 'noon_heavy' | 'holiday_heavy';

export interface FairnessBreakdown {
    weekdayGap: number;
    holidayGap: number;
    noonGap: number;
    alternatePressure: number;
    consecutivePressure: number;
}

export interface RiskAlert {
    personId: string;
    kind: RiskKind;
    severity: 'low' | 'medium' | 'high';
    message: string;
}

export interface PersonInsightMetrics {
    personId: string;
    name: string;
    included: boolean;
    total: number;
    weekday: number;
    holiday: number;
    noon: number;
    alternatePairs: number;
    consecutivePairs: number;
    fairnessScore: number;
    fairness: FairnessBreakdown;
    riskAlerts: RiskAlert[];
}

export interface ForecastResult {
    personId: string;
    name: string;
    included: boolean;
    expectedMin: number;
    expectedMax: number;
    expectedHoliday: number;
    expectedNoon: number;
    confidence: 'low' | 'medium' | 'high';
    status: 'likely_overload' | 'likely_underload' | 'stable';
}

export interface SimulationPlan {
    suggestedExcludeIds: string[];
    suggestedIncludeIds: string[];
    beforeVariance: number;
    afterVariance: number;
    summary: string;
}

export interface PersonTimelinePoint {
    monthKey: string;
    firstCount: number;
    secondCount: number;
    thirdCount: number;
    noonCount: number;
    fairnessScore: number;
    alternatePressure: number;
}
