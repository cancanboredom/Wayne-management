export type ShiftLevel = '1A' | '1B' | '2' | '3';

export interface Shift {
    date: string; // YYYY-MM-DD
    personId: string;
    level: ShiftLevel;
}

export interface ScheduleVersion {
    id: string;
    name?: string;
    timestamp: number;
    month: string;
    shifts: Shift[];
}

export interface Tag {
    id: string;      // e.g. "intern", "supervisor"
    name: string;    // e.g. "Intern", "Supervisor"
    color?: string;  // UI color for generic tags
}

export interface Constraint {
    id: string;
    name: string;
    targetTagId: string; // The Tag ID this applies to, e.g. "intern"
    condition: 'max_shifts_total' | 'max_shifts_holiday' | 'max_shifts_weekday' | 'no_consecutive_holidays' | 'must_pair_with' | 'cannot_pair_with';
    value?: string | number; // e.g. 5 (for max_shifts) or "supervisor" (for must_pair_with)
}

export interface Person {
    id: string;
    name: string;
    color: string;
    tagIds: string[]; // Replaces "role" and "subset", e.g. ["first_call", "intern"]
    unavailableDates?: string[];

    // Specific targets can still exist per person, but tags define broader constraints
    targetTotal?: number;
    targetHoliday?: number;
    targetWeekday?: number;
}

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

// Deprecated or legacy types needed by solver temporarily
export type RoleKey = string;
export interface Slot {
    f1: string; // 1st call slot A (memberId)
    f2: string; // 1st call slot B (memberId)
    sec: string; // 2nd call (memberId)
    thi: string | null; // 3rd call (memberId | null)
}
export interface Member {
    id: string;
    name: string;
    tags: string[];
    active: boolean;
    color?: string;
    group?: string;
    role?: RoleKey;
    subset?: string;
}
export interface OffConstraint {
    memberId: string;
    date: number;
    type: 'off';
}
export interface TaggedDay {
    date: number;
    label?: string;
}
export interface MonthConfig {
    constraints: OffConstraint[];
    confDays: TaggedDay[];
    noonDays: TaggedDay[];
    r1picks: Record<string, number[]>;
    existingShifts?: Record<number, Slot>;
    subsets: SubsetTag[];
    // Cumulative 2nd+3rd total per personId across all past months.
    // Lower = fewer historical shifts = higher scheduling priority.
    cumulativeWeights?: Record<string, number>;
}

export interface SolverResult {
    schedule: Record<number, Slot>;
    stats: Record<string, MemberStats>;
    violations: Violation[];
    bestC: number | null;
    telemetry?: {
        scoreBreakdown: Record<string, number>;
        infeasibilityReasons: string[];
        cohortGapViolations?: Array<{
            ruleId: string;
            ruleName: string;
            dayClass: 'holiday' | 'noon';
            gap: number;
            cap: number;
            memberCount: number;
        }>;
    };
}

export interface MemberStats {
    f: number;
    s: number;
    t: number;
    total: number;
    wk: number;
    noon: number;
    conf: number;
    wScore: number;
}

export interface Violation {
    sev: 'hard' | 'soft';
    day: number | number[] | null;
    msg: string;
}

export interface SubsetTag {
    id: string;
    name: string;
    color: string;
    shape?: string;
    summaryGroupId?: string;
    summaryGroupLabel?: string;
    summaryOrder?: number;
    displayNameFull?: string;
    eligible1st?: boolean;
    eligible2nd?: boolean;
    eligible3rd?: boolean;
    maxShifts?: number | null;
    exactShifts?: number | null;
    mutuallyExclusiveWith?: string;
    pullTag?: string;
    balanceGroup?: boolean;
}
