import type {
  RuleDefinitionV1,
  RuleSetV1,
  RuleValidationResult,
  ValidationIssue,
  WorkspaceSchedulingConfig,
} from './types';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const LEVEL_TOKEN = /^(1[A-Z0-9]{1,4}|2|3|[A-Z0-9_]{1,12})$/;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function isValidLevelToken(v: unknown): v is string {
  return typeof v === 'string' && LEVEL_TOKEN.test(v);
}

function validateLevelToken(token: unknown, ctx: string, errors: string[]) {
  if (!isValidLevelToken(token)) {
    errors.push(`${ctx} must be one of 2, 3, or 1A..1Z.`);
  }
}

function validateRule(rule: RuleDefinitionV1): string[] {
  const errors: string[] = [];
  const rid = (rule as { id?: string }).id || 'unknown';

  if (!rule.id || !rule.name) {
    errors.push('Rule requires id and name.');
  }

  switch (rule.type) {
    case 'slot_eligibility':
      if (!rule.eligibleTagIds.length) errors.push(`Rule ${rid} requires eligibleTagIds.`);
      validateLevelToken(rule.slot, `Rule ${rid} slot`, errors);
      break;
    case 'count_limit':
      if (rule.scope === 'slot' && !rule.slot) errors.push(`Rule ${rid} requires slot when scope=slot.`);
      if (rule.slot != null) validateLevelToken(rule.slot, `Rule ${rid} slot`, errors);
      if (rule.exact != null && !isFiniteNumber(rule.exact)) errors.push(`Rule ${rid} exact must be a number.`);
      if (rule.min != null && !isFiniteNumber(rule.min)) errors.push(`Rule ${rid} min must be a number.`);
      if (rule.max != null && !isFiniteNumber(rule.max)) errors.push(`Rule ${rid} max must be a number.`);
      break;
    case 'sequence_gap':
      if (!isFiniteNumber(rule.minGapDays) || rule.minGapDays < 0) errors.push(`Rule ${rid} minGapDays must be >= 0.`);
      if (rule.slotScope === 'slot' && !rule.slot) errors.push(`Rule ${rid} requires slot when slotScope=slot.`);
      if (rule.slot != null) validateLevelToken(rule.slot, `Rule ${rid} slot`, errors);
      break;
    case 'fairness_balance':
      if (rule.scopeType === 'intra_tag' && !rule.targetTagId) {
        errors.push(`Rule ${rid} requires targetTagId when scopeType=intra_tag.`);
      }
      if (rule.scopeType === 'cohort' && (!rule.memberTagIds || rule.memberTagIds.length === 0)) {
        errors.push(`Rule ${rid} requires memberTagIds when scopeType=cohort.`);
      }
      if (!rule.slotScope?.length) errors.push(`Rule ${rid} requires slotScope.`);
      for (const slot of rule.slotScope || []) validateLevelToken(slot, `Rule ${rid} slotScope[]`, errors);
      if (rule.hardCapGap != null && (!isFiniteNumber(rule.hardCapGap) || rule.hardCapGap < 0)) {
        errors.push(`Rule ${rid} hardCapGap must be >= 0.`);
      }
      if (rule.softWeight != null && (!isFiniteNumber(rule.softWeight) || rule.softWeight < 0)) {
        errors.push(`Rule ${rid} softWeight must be >= 0.`);
      }
      break;
    case 'pairing':
      if (!rule.primaryTagId || !rule.counterpartTagId) errors.push(`Rule ${rid} requires primaryTagId/counterpartTagId.`);
      if (!rule.primarySlots.length || !rule.counterpartSlots.length) errors.push(`Rule ${rid} requires slot arrays.`);
      for (const slot of rule.primarySlots) validateLevelToken(slot, `Rule ${rid} primarySlots[]`, errors);
      for (const slot of rule.counterpartSlots) validateLevelToken(slot, `Rule ${rid} counterpartSlots[]`, errors);
      break;
    case 'objective_weight':
      if (!isFiniteNumber(rule.weight) || rule.weight < 0) errors.push(`Rule ${rid} weight must be >= 0.`);
      break;
    case 'single_shift_per_day':
      if (rule.scope !== 'all_levels') errors.push(`Rule ${rid} scope must be all_levels.`);
      break;
    default:
      break;
  }

  return errors;
}

export function validateRuleSetV1(ruleSet: RuleSetV1, levelRegistry?: Iterable<string>): RuleValidationResult {
  const errors: string[] = [];
  const levelSet = levelRegistry ? new Set(Array.from(levelRegistry)) : null;

  if (ruleSet.schemaVersion !== 'ruleset.v1') errors.push('schemaVersion must be ruleset.v1');
  if (!ruleSet.workspaceId) errors.push('workspaceId is required');
  if (!Number.isInteger(ruleSet.version) || ruleSet.version < 1) errors.push('version must be >= 1');

  for (const rule of ruleSet.rules) {
    errors.push(...validateRule(rule));
    const slots: string[] = [];
    if (rule.type === 'slot_eligibility') slots.push(rule.slot);
    if (rule.type === 'count_limit' && rule.slot) slots.push(rule.slot);
    if (rule.type === 'sequence_gap' && rule.slot) slots.push(rule.slot);
    if (rule.type === 'pairing') {
      slots.push(...rule.primarySlots);
      slots.push(...rule.counterpartSlots);
    }
    if (rule.type === 'fairness_balance') {
      slots.push(...rule.slotScope);
    }
    if (levelSet) {
      for (const slot of slots) {
        if (!levelSet.has(slot)) {
          errors.push(`Rule ${rule.id} references unknown slot level "${slot}".`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateWorkspaceSchedulingConfig(config: WorkspaceSchedulingConfig): {
  ok: boolean;
  errors: string[];
  issues: ValidationIssue[];
} {
  const errors: string[] = [];
  const issues: ValidationIssue[] = [];

  if (!Number.isInteger(config.version) || config.version < 1) {
    errors.push('version must be an integer >= 1');
  }

  const tagIds = new Set<string>();
  for (const tag of config.tags || []) {
    if (!SAFE_ID.test(tag.id)) {
      errors.push(`Invalid tag id "${tag.id}". Use lowercase letters, numbers, dash or underscore.`);
      issues.push({
        field: `tags.${tag.id}.id`,
        code: 'invalid_tag_id',
        message: `Tag id "${tag.id}" is malformed.`,
        suggestion: 'Use lowercase letters, numbers, - and _ only.',
      });
    }
    if (tagIds.has(tag.id)) {
      errors.push(`Duplicate tag id "${tag.id}".`);
      issues.push({
        field: `tags.${tag.id}`,
        code: 'duplicate_tag',
        message: `Duplicate tag id "${tag.id}".`,
      });
    }
    tagIds.add(tag.id);
  }

  const subsetIds = new Set<string>();
  const levelRegistry = new Set<string>(['1A', '1B', '2', '3']);
  for (const subset of config.subsets || []) {
    if (!SAFE_ID.test(subset.id)) {
      errors.push(`Invalid subset id "${subset.id}".`);
      issues.push({
        field: `subsets.${subset.id}.id`,
        code: 'invalid_subset_id',
        message: `Subset id "${subset.id}" is malformed.`,
        suggestion: 'Use lowercase letters, numbers, - and _ only.',
      });
    }
    if (subsetIds.has(subset.id)) errors.push(`Duplicate subset id "${subset.id}".`);
    subsetIds.add(subset.id);
    for (const tagId of subset.tagIds || []) {
      if (!tagIds.has(tagId)) {
        errors.push(`Subset "${subset.id}" references unknown tag "${tagId}".`);
      }
    }
    if (subset.mutuallyExclusiveWith && !tagIds.has(subset.mutuallyExclusiveWith)) {
      errors.push(`Subset "${subset.id}" references unknown mutuallyExclusiveWith tag "${subset.mutuallyExclusiveWith}".`);
    }
    if (subset.pullTag && !tagIds.has(subset.pullTag)) {
      errors.push(`Subset "${subset.id}" references unknown pullTag "${subset.pullTag}".`);
    }
    if (subset.maxShifts != null && (!isFiniteNumber(subset.maxShifts) || subset.maxShifts < 0)) {
      errors.push(`Subset "${subset.id}" maxShifts must be >= 0.`);
    }
    if (subset.exactShifts != null && (!isFiniteNumber(subset.exactShifts) || subset.exactShifts < 0)) {
      errors.push(`Subset "${subset.id}" exactShifts must be >= 0.`);
    }
    for (const level of subset.levelScopes || []) {
      if (!isValidLevelToken(level)) {
        errors.push(`Subset "${subset.id}" has malformed level token "${level}".`);
      } else {
        levelRegistry.add(level);
      }
    }
  }

  for (const template of config.ruleTemplates || []) {
    if (!template?.id) errors.push('Each rule template requires id.');
    if (template.weight != null && (!isFiniteNumber(template.weight) || template.weight < 0)) {
      errors.push(`Rule template "${template.id}" weight must be >= 0.`);
    }
    if ((template.type === 'eligibility_by_tag' || template.type === 'count_limit') && template.params) {
      const tagId = String((template.params as Record<string, unknown>).tagId || '');
      if (tagId && !tagIds.has(tagId)) {
        errors.push(`Rule template "${template.id}" references unknown tag "${tagId}".`);
      }
    }
    if (template.type === 'eligibility_by_tag') {
      const slot = String((template.params as Record<string, unknown>).slot || '');
      if (slot && !levelRegistry.has(slot)) {
        errors.push(`Rule template "${template.id}" references unknown slot "${slot}".`);
      }
    }
    if (template.type === 'fairness_cohort') {
      const raw = template.params as Record<string, unknown>;
      const memberTagIds = Array.isArray(raw.memberTagIds) ? raw.memberTagIds.map(String) : [];
      for (const tagId of memberTagIds) {
        if (!tagIds.has(tagId)) errors.push(`Rule template "${template.id}" references unknown tag "${tagId}".`);
      }
      const slotScope = Array.isArray(raw.slotScope) ? raw.slotScope.map(String) : [];
      for (const slot of slotScope) {
        if (!levelRegistry.has(slot)) errors.push(`Rule template "${template.id}" references unknown slot "${slot}".`);
      }
      const noonSlotScope = Array.isArray(raw.noonSlotScope) ? raw.noonSlotScope.map(String) : [];
      for (const slot of noonSlotScope) {
        if (!levelRegistry.has(slot)) errors.push(`Rule template "${template.id}" references unknown noon slot "${slot}".`);
      }
    }
  }

  for (const cohort of config.fairnessCohorts || []) {
    if (!SAFE_ID.test(cohort.id)) {
      errors.push(`Invalid fairness cohort id "${cohort.id}".`);
    }
    if (!cohort.memberTagIds?.length) {
      errors.push(`Fairness cohort "${cohort.id}" requires memberTagIds.`);
    }
    for (const tagId of cohort.memberTagIds || []) {
      if (!tagIds.has(tagId)) errors.push(`Fairness cohort "${cohort.id}" references unknown tag "${tagId}".`);
    }
    if (!cohort.slotScope?.length) errors.push(`Fairness cohort "${cohort.id}" requires slotScope.`);
    for (const slot of cohort.slotScope || []) {
      if (!levelRegistry.has(slot)) errors.push(`Fairness cohort "${cohort.id}" references unknown slot "${slot}".`);
    }
    for (const slot of cohort.noonSlotScope || []) {
      if (!levelRegistry.has(slot)) errors.push(`Fairness cohort "${cohort.id}" references unknown noon slot "${slot}".`);
    }
    if (!isFiniteNumber(cohort.hardCapGap) || cohort.hardCapGap !== 1) {
      errors.push(`Fairness cohort "${cohort.id}" hardCapGap must be exactly 1.`);
    }
  }

  return { ok: errors.length === 0, errors, issues };
}
