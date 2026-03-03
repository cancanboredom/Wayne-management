import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import type { WorkspaceSchedulingConfig } from '../../lib/scheduling/types';

export const CALL_TAG_IDS = ['first_call', 'second_call', 'third_call'] as const;

type NormalizeOptions = {
  singleRuleGroup?: boolean;
};

function getActiveSubsetIds(config?: WorkspaceSchedulingConfig | null): string[] {
  const configured = (config?.subsets || [])
    .filter((subset) => subset.active !== false)
    .map((subset) => subset.id);
  if (configured.length > 0) return configured;
  return DEFAULT_SUBSETS.map((subset) => subset.id);
}

export function getRuleGroupTagIds(config?: WorkspaceSchedulingConfig | null): string[] {
  return getActiveSubsetIds(config).filter(Boolean);
}

export function splitPersonTags(tagIds: string[], config?: WorkspaceSchedulingConfig | null): {
  callTags: string[];
  ruleGroupTags: string[];
  otherTags: string[];
} {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const tagId of tagIds || []) {
    if (!tagId || seen.has(tagId)) continue;
    seen.add(tagId);
    deduped.push(tagId);
  }

  const callTagSet = new Set<string>(CALL_TAG_IDS);
  const ruleGroupTagSet = new Set<string>(getRuleGroupTagIds(config));
  const callTags: string[] = [];
  const ruleGroupTags: string[] = [];
  const otherTags: string[] = [];

  for (const tagId of deduped) {
    if (callTagSet.has(tagId)) {
      callTags.push(tagId);
      continue;
    }
    if (ruleGroupTagSet.has(tagId)) {
      ruleGroupTags.push(tagId);
      continue;
    }
    otherTags.push(tagId);
  }

  return { callTags, ruleGroupTags, otherTags };
}

export function normalizePersonTags(
  tagIds: string[],
  config?: WorkspaceSchedulingConfig | null,
  options?: NormalizeOptions
): string[] {
  const { callTags, ruleGroupTags, otherTags } = splitPersonTags(tagIds || [], config);
  const singleRuleGroup = options?.singleRuleGroup !== false;

  if (!singleRuleGroup) {
    return [...callTags, ...ruleGroupTags, ...otherTags];
  }

  const orderedRuleGroupIds = getRuleGroupTagIds(config);
  const selectedRuleGroup = orderedRuleGroupIds.find((id) => ruleGroupTags.includes(id))
    || ruleGroupTags[0]
    || null;

  return [...callTags, ...(selectedRuleGroup ? [selectedRuleGroup] : []), ...otherTags];
}

export function countRuleGroupTags(tagIds: string[], config?: WorkspaceSchedulingConfig | null): number {
  return splitPersonTags(tagIds, config).ruleGroupTags.length;
}
