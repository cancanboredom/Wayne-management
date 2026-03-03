import { DEFAULT_SUBSETS } from '../shiftplan/constants';
import type { Constraint, SubsetTag } from '../shiftplan/types';
import type {
  RuleDefinitionV1,
  RuleSetV1,
  Workspace,
  WorkspaceFairnessCohort,
  WorkspaceRuleTemplate,
  WorkspaceSchedulingConfig,
  WorkspaceTagDefinition,
} from './types';

function fromSubsetTag(sub: SubsetTag): RuleDefinitionV1[] {
  const out: RuleDefinitionV1[] = [];

  if (sub.eligible1st) {
    out.push({
      id: `elig-${sub.id}-1A`,
      name: `${sub.name} eligible for 1A`,
      type: 'slot_eligibility',
      enabled: true,
      severity: 'hard',
      slot: '1A',
      eligibleTagIds: [sub.id],
    });
    out.push({
      id: `elig-${sub.id}-1B`,
      name: `${sub.name} eligible for 1B`,
      type: 'slot_eligibility',
      enabled: true,
      severity: 'hard',
      slot: '1B',
      eligibleTagIds: [sub.id],
    });
  }
  if (sub.eligible2nd) {
    out.push({
      id: `elig-${sub.id}-2`,
      name: `${sub.name} eligible for 2`,
      type: 'slot_eligibility',
      enabled: true,
      severity: 'hard',
      slot: '2',
      eligibleTagIds: [sub.id],
    });
  }
  if (sub.eligible3rd) {
    out.push({
      id: `elig-${sub.id}-3`,
      name: `${sub.name} eligible for 3`,
      type: 'slot_eligibility',
      enabled: true,
      severity: 'hard',
      slot: '3',
      eligibleTagIds: [sub.id],
    });
  }

  if (sub.maxShifts != null) {
    out.push({
      id: `max-${sub.id}`,
      name: `${sub.name} max monthly shifts`,
      type: 'count_limit',
      enabled: true,
      severity: 'hard',
      targetTagId: sub.id,
      metric: 'count',
      scope: 'total',
      window: 'month',
      dayClass: 'all',
      max: sub.maxShifts,
    });
  }

  if (sub.exactShifts != null) {
    out.push({
      id: `exact-${sub.id}`,
      name: `${sub.name} exact monthly shifts`,
      type: 'count_limit',
      enabled: true,
      severity: 'hard',
      targetTagId: sub.id,
      metric: 'count',
      scope: 'total',
      window: 'month',
      dayClass: 'all',
      exact: sub.exactShifts,
    });
  }

  if (sub.mutuallyExclusiveWith) {
    out.push({
      id: `pair-cannot-${sub.id}-${sub.mutuallyExclusiveWith}`,
      name: `${sub.name} cannot pair with ${sub.mutuallyExclusiveWith}`,
      type: 'pairing',
      enabled: true,
      severity: 'hard',
      pairing: 'cannot_pair_with',
      primaryTagId: sub.id,
      counterpartTagId: sub.mutuallyExclusiveWith,
      primarySlots: ['2'],
      counterpartSlots: ['1A', '1B'],
    });
  }

  if (sub.pullTag) {
    out.push({
      id: `pair-must-${sub.id}-${sub.pullTag}`,
      name: `${sub.name} prefers pairing with ${sub.pullTag}`,
      type: 'pairing',
      enabled: true,
      severity: 'soft',
      pairing: 'must_pair_with',
      primaryTagId: sub.id,
      counterpartTagId: sub.pullTag,
      primarySlots: ['2'],
      counterpartSlots: ['1A', '1B'],
    });
  }

  return out;
}

function fromLegacyConstraint(constraint: Constraint): RuleDefinitionV1 | null {
  const id = `legacy-${constraint.id}`;
  if (!constraint.targetTagId) return null;

  switch (constraint.condition) {
    case 'max_shifts_total':
      return {
        id,
        name: constraint.name,
        type: 'count_limit',
        enabled: true,
        severity: 'hard',
        targetTagId: constraint.targetTagId,
        metric: 'count',
        scope: 'total',
        window: 'month',
        dayClass: 'all',
        max: typeof constraint.value === 'number' ? constraint.value : Number(constraint.value || 0),
      };
    case 'max_shifts_holiday':
      return {
        id,
        name: constraint.name,
        type: 'count_limit',
        enabled: true,
        severity: 'hard',
        targetTagId: constraint.targetTagId,
        metric: 'count',
        scope: 'total',
        window: 'month',
        dayClass: 'holiday',
        max: typeof constraint.value === 'number' ? constraint.value : Number(constraint.value || 0),
      };
    case 'max_shifts_weekday':
      return {
        id,
        name: constraint.name,
        type: 'count_limit',
        enabled: true,
        severity: 'hard',
        targetTagId: constraint.targetTagId,
        metric: 'count',
        scope: 'total',
        window: 'month',
        dayClass: 'weekday',
        max: typeof constraint.value === 'number' ? constraint.value : Number(constraint.value || 0),
      };
    case 'no_consecutive_holidays':
      return {
        id,
        name: constraint.name,
        type: 'sequence_gap',
        enabled: true,
        severity: 'hard',
        targetTagId: constraint.targetTagId,
        slotScope: 'any',
        minGapDays: 1,
        dayClass: 'holiday',
      };
    case 'must_pair_with':
      return {
        id,
        name: constraint.name,
        type: 'pairing',
        enabled: true,
        severity: 'hard',
        pairing: 'must_pair_with',
        primaryTagId: constraint.targetTagId,
        counterpartTagId: String(constraint.value || ''),
        primarySlots: ['1A', '1B', '2', '3'],
        counterpartSlots: ['1A', '1B', '2', '3'],
      };
    case 'cannot_pair_with':
      return {
        id,
        name: constraint.name,
        type: 'pairing',
        enabled: true,
        severity: 'hard',
        pairing: 'cannot_pair_with',
        primaryTagId: constraint.targetTagId,
        counterpartTagId: String(constraint.value || ''),
        primarySlots: ['1A', '1B', '2', '3'],
        counterpartSlots: ['1A', '1B', '2', '3'],
      };
    default:
      return null;
  }
}

export function buildLegacyBackedRuleSet(workspace: Workspace, legacyConstraints: Constraint[] = []): RuleSetV1 {
  const rules: RuleDefinitionV1[] = [];

  for (const sub of DEFAULT_SUBSETS) {
    rules.push(...fromSubsetTag(sub));
  }

  for (const c of legacyConstraints) {
    const mapped = fromLegacyConstraint(c);
    if (mapped) rules.push(mapped);
  }

  rules.push(
    {
      id: 'hard-single-shift-per-day',
      name: 'One shift type per person per day',
      type: 'single_shift_per_day',
      enabled: true,
      severity: 'hard',
      scope: 'all_levels',
    },
    {
      id: 'weight-fairness',
      name: 'Fairness weight',
      type: 'objective_weight',
      enabled: true,
      severity: 'soft',
      objective: 'fairness',
      weight: 1,
    },
    {
      id: 'weight-clustering',
      name: 'Clustering weight',
      type: 'objective_weight',
      enabled: true,
      severity: 'soft',
      objective: 'clustering',
      weight: 1,
    },
    {
      id: 'weight-cumulative',
      name: 'Cumulative deficit weight',
      type: 'objective_weight',
      enabled: true,
      severity: 'soft',
      objective: 'cumulative_deficit',
      weight: 1,
    }
  );

  return {
    schemaVersion: 'ruleset.v1',
    version: 1,
    workspaceId: workspace.id,
    periodKind: 'month',
    generatedFromLegacy: true,
    rules,
    updatedAt: Date.now(),
  };
}

function normalizeSubsetLevelToken(level: string): '1A' | '1B' | '2' | '3' | null {
  if (level === '1A' || level === '1B' || level === '2' || level === '3') return level;
  if (level === '1') return '1A';
  return null;
}

function normalizeDayClass(raw: unknown): 'all' | 'weekday' | 'holiday' | 'noon' {
  const v = String(raw || 'all');
  if (v === 'weekday' || v === 'holiday' || v === 'noon') return v;
  return 'all';
}

function normalizeSlots(raw: unknown): Array<'1A' | '1B' | '2' | '3'> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => normalizeSubsetLevelToken(String(v)))
    .filter(Boolean) as Array<'1A' | '1B' | '2' | '3'>;
}

function buildEligibilityScopeMap(config: WorkspaceSchedulingConfig | null | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const templates = config?.ruleTemplates || [];
  for (const template of templates) {
    if (!template.enabled || template.type !== 'eligibility_by_tag') continue;
    const rawSlot = String(template.params?.slot || '');
    const slot = normalizeSubsetLevelToken(rawSlot);
    const tagId = String(template.params?.tagId || '');
    if (!slot || !tagId) continue;
    if (!out.has(tagId)) out.set(tagId, new Set<string>());
    out.get(tagId)!.add(slot);
  }
  for (const subset of config?.subsets || []) {
    if (subset.active === false) continue;
    const scopeSet = new Set(
      (subset.levelScopes || [])
        .map((lv) => normalizeSubsetLevelToken(String(lv)))
        .filter(Boolean) as Array<'1A' | '1B' | '2' | '3'>
    );
    if (scopeSet.size === 0) continue;
    for (const tagId of subset.tagIds || []) {
      if (!out.has(tagId)) out.set(tagId, new Set<string>());
      scopeSet.forEach((lv) => out.get(tagId)!.add(lv));
    }
    if (subset.id && !out.has(subset.id)) {
      out.set(subset.id, new Set(scopeSet));
    }
  }
  return out;
}

function mapTagToSubsetTag(
  tag: WorkspaceTagDefinition,
  index: number,
  scopes: Set<string>,
  subsetDef?: WorkspaceSchedulingConfig['subsets'][number]
): SubsetTag {
  return {
    id: tag.id,
    name: tag.label,
    color: '#e5e7eb',
    summaryGroupId: tag.id,
    summaryGroupLabel: tag.label,
    summaryOrder: index + 1,
    displayNameFull: tag.label,
    eligible1st: scopes.has('1A') || scopes.has('1B') || scopes.has('1'),
    eligible2nd: scopes.has('2'),
    eligible3rd: scopes.has('3'),
    balanceGroup: subsetDef?.balanceGroup ?? true,
    maxShifts: subsetDef?.maxShifts,
    exactShifts: subsetDef?.exactShifts,
    mutuallyExclusiveWith: subsetDef?.mutuallyExclusiveWith,
    pullTag: subsetDef?.pullTag,
  };
}

function fromIntraTagDefaults(config: WorkspaceSchedulingConfig): RuleDefinitionV1[] {
  const excluded = new Set(['first_call', 'second_call', 'third_call']);
  const activeTags = (config.tags || []).filter((t) => t.active !== false && !excluded.has(t.id));
  const scopeByTag = buildEligibilityScopeMap(config);
  const out: RuleDefinitionV1[] = [];
  for (const tag of activeTags) {
    const scopes = scopeByTag.get(tag.id);
    if (!scopes || scopes.size === 0) continue;
    const slotScope = normalizeSlots(Array.from(scopes));
    if (!slotScope.length) continue;
    out.push({
      id: `intra-${tag.id}-total`,
      name: `${tag.label} total balance`,
      type: 'fairness_balance',
      enabled: true,
      severity: 'hard',
      scopeType: 'intra_tag',
      targetTagId: tag.id,
      slotScope,
      metric: 'count',
      dayClass: 'all',
      hardCapGap: 1,
    });
    out.push({
      id: `intra-${tag.id}-holiday`,
      name: `${tag.label} holiday balance`,
      type: 'fairness_balance',
      enabled: true,
      severity: 'hard',
      scopeType: 'intra_tag',
      targetTagId: tag.id,
      slotScope,
      metric: 'count',
      dayClass: 'holiday',
      hardCapGap: 1,
    });
    const noonScope = slotScope.filter((s) => s !== '3');
    if (noonScope.length > 0) {
      out.push({
        id: `intra-${tag.id}-noon`,
        name: `${tag.label} noon balance`,
        type: 'fairness_balance',
        enabled: true,
        severity: 'hard',
        scopeType: 'intra_tag',
        targetTagId: tag.id,
        slotScope: noonScope,
        metric: 'count',
        dayClass: 'noon',
        hardCapGap: 1,
      });
    }
  }
  return out;
}

function fromFairnessCohort(cohort: WorkspaceFairnessCohort): RuleDefinitionV1[] {
  if (!cohort.enabled) return [];
  const slotScope = normalizeSlots(cohort.slotScope);
  const noonSlotScope = normalizeSlots(cohort.noonSlotScope || []);
  if (!cohort.memberTagIds?.length || !slotScope.length) return [];
  const base = {
    enabled: true,
    severity: 'hard' as const,
    type: 'fairness_balance' as const,
    scopeType: 'cohort' as const,
    memberTagIds: cohort.memberTagIds,
    metric: 'count' as const,
    hardCapGap: Math.max(0, Number(cohort.hardCapGap || 0)),
  };
  const rules: RuleDefinitionV1[] = [];
  if (cohort.enforceTotal !== false) {
    rules.push({
      id: `cohort-${cohort.id}-total`,
      name: `${cohort.name} total balance`,
      ...base,
      dayClass: 'all',
      slotScope,
    });
  }
  if (cohort.enforceHoliday !== false) {
    rules.push({
      id: `cohort-${cohort.id}-holiday`,
      name: `${cohort.name} holiday balance`,
      ...base,
      dayClass: 'holiday',
      slotScope,
    });
  }
  if (cohort.enforceNoon !== false) {
    rules.push({
      id: `cohort-${cohort.id}-noon`,
      name: `${cohort.name} noon balance`,
      ...base,
      dayClass: 'noon',
      slotScope: noonSlotScope.length ? noonSlotScope : slotScope,
    });
  }
  return rules;
}

export function toSubsetTagsFromWorkspaceConfig(config?: WorkspaceSchedulingConfig | null): SubsetTag[] {
  const activeTags = (config?.tags || []).filter((t) => t.active !== false);
  if (!activeTags.length) return DEFAULT_SUBSETS;
  const scopeByTag = buildEligibilityScopeMap(config);
  const subsetById = new Map((config?.subsets || []).map((s) => [s.id, s]));
  return activeTags.map((tag, index) => {
    const scopes = scopeByTag.get(tag.id) || new Set<string>();
    return mapTagToSubsetTag(tag, index, scopes, subsetById.get(tag.id));
  });
}

function fromRuleTemplate(template: WorkspaceRuleTemplate): RuleDefinitionV1[] {
  if (!template.enabled) return [];
  const severity: 'hard' | 'soft' = template.hard ? 'hard' : 'soft';
  const id = `tpl-${template.id}`;
  if (template.type === 'single_shift_per_day') {
    return [{
      id,
      name: 'One shift type per person per day',
      type: 'single_shift_per_day',
      enabled: true,
      severity: 'hard',
      scope: 'all_levels',
    }];
  }
  if (template.type === 'eligibility_by_tag') {
    const slot = normalizeSubsetLevelToken(String(template.params.slot || ''));
    const tagId = String(template.params.tagId || '');
    if (!slot || !tagId) return [];
    return [{
      id,
      name: `Eligibility ${tagId} -> ${slot}`,
      type: 'slot_eligibility',
      enabled: true,
      severity,
      slot,
      eligibleTagIds: [tagId],
    }];
  }
  if (template.type === 'count_limit') {
    const tagId = String(template.params.tagId || '');
    if (!tagId) return [];
    const min = template.params.min == null ? undefined : Number(template.params.min);
    const max = template.params.max == null ? undefined : Number(template.params.max);
    const exact = template.params.exact == null ? undefined : Number(template.params.exact);
    const dayClass = normalizeDayClass(template.params.dayClass);
    const slot = normalizeSubsetLevelToken(String(template.params.slot || ''));
    const scope = slot ? 'slot' as const : 'total' as const;
    return [{
      id,
      name: `Count limit ${tagId}`,
      type: 'count_limit',
      enabled: true,
      severity,
      targetTagId: tagId,
      metric: 'count',
      scope,
      slot: scope === 'slot' ? slot : undefined,
      window: 'month',
      dayClass,
      min: Number.isFinite(min) ? min : undefined,
      max: Number.isFinite(max) ? max : undefined,
      exact: Number.isFinite(exact) ? exact : undefined,
    }];
  }
  if (template.type === 'sequence_gap') {
    const tagId = String(template.params.tagId || '');
    const minGapDays = Number(template.params.minGapDays || 0);
    const slot = normalizeSubsetLevelToken(String(template.params.slot || ''));
    const dayClass = normalizeDayClass(template.params.dayClass);
    return [{
      id,
      name: `Rest gap ${tagId || 'all'}`,
      type: 'sequence_gap',
      enabled: true,
      severity,
      targetTagId: tagId || undefined,
      slotScope: slot ? 'slot' : 'any',
      slot: slot || undefined,
      minGapDays: Number.isFinite(minGapDays) ? minGapDays : 0,
      dayClass,
    }];
  }
  if (template.type === 'pairing') {
    const primaryTagId = String(template.params.primaryTagId || '');
    const counterpartTagId = String(template.params.counterpartTagId || '');
    const pairing = template.params.mode === 'cannot_pair_with' ? 'cannot_pair_with' : 'must_pair_with';
    if (!primaryTagId || !counterpartTagId) return [];
    return [{
      id,
      name: `${pairing} ${primaryTagId}/${counterpartTagId}`,
      type: 'pairing',
      enabled: true,
      severity,
      pairing,
      primaryTagId,
      counterpartTagId,
      primarySlots: ['1A', '1B', '2', '3'],
      counterpartSlots: ['1A', '1B', '2', '3'],
    }];
  }
  if (template.type === 'fairness_cohort') {
    const memberTagIds = Array.isArray(template.params.memberTagIds)
      ? template.params.memberTagIds.map(String).filter(Boolean)
      : [];
    const slotScope = normalizeSlots(template.params.slotScope);
    const noonSlotScope = normalizeSlots(template.params.noonSlotScope);
    const hardCapGap = Number(template.params.hardCapGap ?? 1);
    if (!memberTagIds.length || !slotScope.length) return [];
    const base = {
      type: 'fairness_balance' as const,
      enabled: true,
      severity,
      scopeType: 'cohort' as const,
      memberTagIds,
      slotScope,
      metric: 'count' as const,
      hardCapGap: Number.isFinite(hardCapGap) ? Math.max(0, hardCapGap) : 1,
    };
    return [
      {
        id: `${id}-total`,
        name: `Cohort total ${template.id}`,
        ...base,
        dayClass: 'all',
      },
      {
        id: `${id}-holiday`,
        name: `Cohort holiday ${template.id}`,
        ...base,
        dayClass: 'holiday',
      },
      {
        id: `${id}-noon`,
        name: `Cohort noon ${template.id}`,
        ...base,
        dayClass: 'noon',
        slotScope: noonSlotScope.length ? noonSlotScope : slotScope,
      },
    ];
  }
  return [];
}

export function buildRuleSetFromWorkspaceConfig(
  workspace: Workspace,
  schedulingConfig: WorkspaceSchedulingConfig | null | undefined,
  legacyConstraints: Constraint[] = []
): RuleSetV1 {
  if (!schedulingConfig) return buildLegacyBackedRuleSet(workspace, legacyConstraints);
  const rules: RuleDefinitionV1[] = [];
  for (const template of schedulingConfig.ruleTemplates || []) {
    rules.push(...fromRuleTemplate(template));
  }
  rules.push(...fromIntraTagDefaults(schedulingConfig));
  for (const cohort of schedulingConfig.fairnessCohorts || []) {
    rules.push(...fromFairnessCohort(cohort));
  }
  for (const c of legacyConstraints) {
    const mapped = fromLegacyConstraint(c);
    if (mapped) rules.push(mapped);
  }
  if (!rules.some((r) => r.type === 'single_shift_per_day' && r.enabled)) {
    rules.push({
      id: 'hard-single-shift-per-day',
      name: 'One shift type per person per day',
      type: 'single_shift_per_day',
      enabled: true,
      severity: 'hard',
      scope: 'all_levels',
    });
  }
  if (!rules.some((r) => r.type === 'objective_weight')) {
    rules.push(
      {
        id: 'weight-fairness',
        name: 'Fairness weight',
        type: 'objective_weight',
        enabled: true,
        severity: 'soft',
        objective: 'fairness',
        weight: 1,
      },
      {
        id: 'weight-clustering',
        name: 'Clustering weight',
        type: 'objective_weight',
        enabled: true,
        severity: 'soft',
        objective: 'clustering',
        weight: 1,
      },
      {
        id: 'weight-cumulative',
        name: 'Cumulative deficit weight',
        type: 'objective_weight',
        enabled: true,
        severity: 'soft',
        objective: 'cumulative_deficit',
        weight: 1,
      },
    );
  }

  return {
    schemaVersion: 'ruleset.v1',
    version: Math.max(1, schedulingConfig.version || 1),
    workspaceId: workspace.id,
    periodKind: 'month',
    generatedFromLegacy: false,
    rules,
    updatedAt: Date.now(),
  };
}
