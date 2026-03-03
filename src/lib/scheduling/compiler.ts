import type { CompiledRuleSet, RuleDefinitionV1, RuleSetV1 } from './types';

export function compileRuleSet(ruleSet: RuleSetV1): CompiledRuleSet {
  const warnings: string[] = [];
  const hardRules = ruleSet.rules.filter((r) => r.enabled && r.severity === 'hard');
  const softRules = ruleSet.rules.filter((r) => r.enabled && r.severity === 'soft');
  const seenIds = new Set<string>();
  for (const rule of ruleSet.rules) {
    if (seenIds.has(rule.id)) warnings.push(`Duplicate rule id: ${rule.id}`);
    seenIds.add(rule.id);
  }

  const eligibilityBySlot: CompiledRuleSet['eligibilityBySlot'] = {};
  for (const rule of ruleSet.rules) {
    if (!rule.enabled || rule.type !== 'slot_eligibility') continue;
    const existing = eligibilityBySlot[rule.slot];
    if (!existing) {
      eligibilityBySlot[rule.slot] = new Set(rule.eligibleTagIds);
      continue;
    }
    let overlap = 0;
    for (const tagId of rule.eligibleTagIds) {
      if (existing.has(tagId)) overlap += 1;
      existing.add(tagId);
    }
    if (overlap > 0) {
      warnings.push(`Overlapping slot_eligibility tags on slot ${rule.slot} for rule ${rule.id}`);
    }
  }

  const objectiveWeights = {
    fairness: 1,
    clustering: 1,
    cumulativeDeficit: 1,
  };

  for (const rule of ruleSet.rules) {
    if (!rule.enabled || rule.type !== 'objective_weight') continue;
    if (rule.objective === 'fairness') objectiveWeights.fairness = rule.weight;
    if (rule.objective === 'clustering') objectiveWeights.clustering = rule.weight;
    if (rule.objective === 'cumulative_deficit') objectiveWeights.cumulativeDeficit = rule.weight;
  }

  return {
    hardRules,
    softRules,
    eligibilityBySlot,
    objectiveWeights,
    warnings,
  };
}

export function hasTag(tags: string[] | undefined, tag: string): boolean {
  return !!tags && tags.includes(tag);
}

export function getTagMatch(rule: RuleDefinitionV1, tags: string[] | undefined): boolean {
  if (!tags?.length) return false;
  if (rule.type === 'count_limit') return tags.includes(rule.targetTagId);
  if (rule.type === 'pairing') return tags.includes(rule.primaryTagId);
  if (rule.type === 'sequence_gap') return rule.targetTagId ? tags.includes(rule.targetTagId) : true;
  return false;
}
