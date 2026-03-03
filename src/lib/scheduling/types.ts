import type { ShiftLevel, Shift, Member, MonthConfig, SolverResult, Violation, Constraint } from '../shiftplan/types';

export type RuleSeverity = 'hard' | 'soft';
export type DayClass = 'all' | 'weekday' | 'holiday' | 'noon';
export type SlotKey = ShiftLevel;
export type NormalizedLevel = '1A' | '1B' | '2' | '3' | string;

export interface ScheduleFrameCell {
  date: string;
  day: number;
  level: NormalizedLevel;
  personId: string | null;
  locked: boolean;
}

export interface ScheduleFrame {
  year: number;
  month: number;
  daysInMonth: number;
  levels: NormalizedLevel[];
  byDay: Record<number, Record<string, ScheduleFrameCell>>;
}

export interface ConstraintModel {
  hardRules: RuleDefinitionV1[];
  softRules: RuleDefinitionV1[];
  objectiveWeights: {
    fairness: number;
    clustering: number;
    cumulativeDeficit: number;
  };
}

export type MoveOperator = 'assign' | 'swap' | 'rotate_window' | 'repair_swap';

export interface MoveDelta {
  operator: MoveOperator;
  accepted: boolean;
  day: number;
  day2?: number;
  level?: NormalizedLevel;
  previousCost: number;
  nextCost: number;
}

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceTagDefinition {
  id: string;
  label: string;
  color?: string;
  active: boolean;
}

export interface WorkspaceSubsetDefinition {
  id: string;
  name: string;
  tagIds: string[];
  levelScopes: string[];
  active: boolean;
  priority?: number;
}

export interface WorkspaceRuleTemplate {
  id: string;
  type:
  | 'eligibility_by_tag'
  | 'single_shift_per_day'
  | 'count_limit'
  | 'sequence_gap'
  | 'pairing'
  | 'fairness_cohort';
  enabled: boolean;
  hard: boolean;
  params: Record<string, unknown>;
  weight?: number;
}

export interface WorkspaceFairnessCohort {
  id: string;
  name: string;
  memberTagIds: string[];
  slotScope: SlotKey[];
  hardCapGap: number;
  enforceTotal?: boolean;
  enforceHoliday?: boolean;
  enforceNoon?: boolean;
  noonSlotScope?: SlotKey[];
  enabled: boolean;
}

export interface WorkspaceSchedulingConfig {
  version: number;
  tags: WorkspaceTagDefinition[];
  subsets: WorkspaceSubsetDefinition[];
  ruleTemplates: WorkspaceRuleTemplate[];
  fairnessCohorts?: WorkspaceFairnessCohort[];
  updatedAt: number;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface SchedulePeriod {
  kind: 'month';
  year: number;
  month: number; // 1-based
}

export interface RuleBase {
  id: string;
  name: string;
  enabled: boolean;
  severity: RuleSeverity;
}

export interface AvailabilityOffRule extends RuleBase {
  type: 'availability_off';
  memberIds?: string[];
}

export interface SlotEligibilityRule extends RuleBase {
  type: 'slot_eligibility';
  slot: SlotKey;
  eligibleTagIds: string[];
}

export interface CountLimitRule extends RuleBase {
  type: 'count_limit';
  targetTagId: string;
  metric: 'count';
  scope: 'total' | 'slot';
  slot?: SlotKey;
  window: 'month';
  dayClass: DayClass;
  min?: number;
  max?: number;
  exact?: number;
}

export interface SequenceGapRule extends RuleBase {
  type: 'sequence_gap';
  targetTagId?: string;
  slotScope: 'any' | 'slot';
  slot?: SlotKey;
  minGapDays: number;
  dayClass: DayClass;
}

export interface PairingRule extends RuleBase {
  type: 'pairing';
  pairing: 'must_pair_with' | 'cannot_pair_with';
  primaryTagId: string;
  counterpartTagId: string;
  primarySlots: SlotKey[];
  counterpartSlots: SlotKey[];
}

export interface ObjectiveWeightRule extends RuleBase {
  type: 'objective_weight';
  objective: 'fairness' | 'clustering' | 'cumulative_deficit';
  weight: number;
}

export interface SingleShiftPerDayRule extends RuleBase {
  type: 'single_shift_per_day';
  scope: 'all_levels';
}

export interface FairnessBalanceRule extends RuleBase {
  type: 'fairness_balance';
  scopeType: 'intra_tag' | 'cohort';
  targetTagId?: string;
  memberTagIds?: string[];
  slotScope: SlotKey[];
  metric: 'count';
  dayClass: 'all' | 'holiday' | 'noon';
  hardCapGap?: number;
  softWeight?: number;
}

export type RuleDefinitionV1 =
  | AvailabilityOffRule
  | SlotEligibilityRule
  | CountLimitRule
  | SequenceGapRule
  | PairingRule
  | ObjectiveWeightRule
  | SingleShiftPerDayRule
  | FairnessBalanceRule;

export interface RuleSetV1 {
  schemaVersion: 'ruleset.v1';
  version: number;
  workspaceId: string;
  periodKind: 'month';
  generatedFromLegacy?: boolean;
  rules: RuleDefinitionV1[];
  updatedAt: number;
}

export interface SolverInputV2 {
  workspaceId: string;
  period: SchedulePeriod;
  mode: 'all' | '2nd3rd';
  members: Member[];
  config: MonthConfig;
  ruleSet: RuleSetV1;
  schedulingConfig?: WorkspaceSchedulingConfig;
  legacyConstraints?: Constraint[];
  seed?: number;
  extraAssignmentsByDay?: Record<number, Record<string, string>>;
}

export interface SolverRunMeta {
  runtimeMs: number;
  inputHash: string;
  rulesetVersion: number;
  usedFallback: boolean;
  seed: number;
  configVersion?: number;
  needsHardViolationConfirm: boolean;
  compileWarnings?: string[];
  scoreBreakdown?: Record<string, number>;
  infeasibilityReasons?: string[];
  cohortGapViolations?: Array<{
    ruleId: string;
    ruleName: string;
    dayClass: 'holiday' | 'noon';
    gap: number;
    cap: number;
    memberCount: number;
  }>;
  replayId?: string;
  shadow?: {
    enabled: boolean;
    mode: 'v1-primary' | 'v2-primary';
    deltaHardViolations: number;
    deltaCost: number;
  };
}

export interface SolverOutputV2 {
  shifts: Shift[];
  result: SolverResult;
  violations: Violation[];
  meta: SolverRunMeta;
}

export interface RuleValidationResult {
  ok: boolean;
  errors: string[];
}

export interface CompiledRuleSet {
  hardRules: RuleDefinitionV1[];
  softRules: RuleDefinitionV1[];
  eligibilityBySlot: Partial<Record<SlotKey, Set<string>>>;
  objectiveWeights: {
    fairness: number;
    clustering: number;
    cumulativeDeficit: number;
  };
  warnings: string[];
}
