import type { Person } from '../shiftplan/types';
import type { WorkspaceFairnessCohort, WorkspaceRuleTemplate, WorkspaceSchedulingConfig } from './types';

export interface TagAuditEntry {
  tagId: string;
  usedByPeople: number;
  referencedInRules: boolean;
  referencedInCohorts: boolean;
  subsetReferenceCount: number;
  safeToRemove: boolean;
}

export interface TagAuditResult {
  entries: Record<string, TagAuditEntry>;
  safeToRemoveTagIds: string[];
}

function templateReferencesTag(template: WorkspaceRuleTemplate, tagId: string): boolean {
  if (!template.enabled) return false;
  const params = template.params || {};
  if (template.type === 'eligibility_by_tag') return String(params.tagId || '') === tagId;
  if (template.type === 'count_limit') return String(params.tagId || '') === tagId;
  if (template.type === 'sequence_gap') return String(params.tagId || '') === tagId;
  if (template.type === 'pairing') {
    return String(params.primaryTagId || '') === tagId || String(params.counterpartTagId || '') === tagId;
  }
  if (template.type === 'fairness_cohort') {
    return Array.isArray(params.memberTagIds) && params.memberTagIds.map(String).includes(tagId);
  }
  return false;
}

function cohortReferencesTag(cohort: WorkspaceFairnessCohort, tagId: string): boolean {
  return cohort.enabled !== false && (cohort.memberTagIds || []).includes(tagId);
}

export function computeTagAudit(
  tagIds: string[],
  people: Person[],
  config: WorkspaceSchedulingConfig | null | undefined,
): TagAuditResult {
  const entries: Record<string, TagAuditEntry> = {};

  for (const tagId of tagIds) {
    entries[tagId] = {
      tagId,
      usedByPeople: 0,
      referencedInRules: false,
      referencedInCohorts: false,
      subsetReferenceCount: 0,
      safeToRemove: false,
    };
  }

  for (const person of people) {
    for (const tagId of person.tagIds || []) {
      if (entries[tagId]) entries[tagId].usedByPeople += 1;
    }
  }

  for (const template of config?.ruleTemplates || []) {
    for (const tagId of tagIds) {
      if (templateReferencesTag(template, tagId)) entries[tagId].referencedInRules = true;
    }
  }

  for (const cohort of config?.fairnessCohorts || []) {
    for (const tagId of tagIds) {
      if (cohortReferencesTag(cohort, tagId)) entries[tagId].referencedInCohorts = true;
    }
  }

  for (const subset of config?.subsets || []) {
    const refs = new Set<string>([(subset.id || '').trim(), ...((subset.tagIds || []).map((id) => id.trim()))]);
    for (const tagId of tagIds) {
      if (refs.has(tagId)) entries[tagId].subsetReferenceCount += 1;
    }
  }

  const safeToRemoveTagIds: string[] = [];
  for (const tagId of tagIds) {
    const entry = entries[tagId];
    entry.safeToRemove = entry.usedByPeople === 0 && !entry.referencedInRules && !entry.referencedInCohorts;
    if (entry.safeToRemove) safeToRemoveTagIds.push(tagId);
  }

  safeToRemoveTagIds.sort();
  return { entries, safeToRemoveTagIds };
}
