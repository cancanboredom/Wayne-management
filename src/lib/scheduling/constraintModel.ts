import type { CompiledRuleSet, ConstraintModel, RuleSetV1 } from './types';
import { compileRuleSet } from './compiler';

export function buildConstraintModel(ruleSet: RuleSetV1): ConstraintModel {
  const compiled: CompiledRuleSet = compileRuleSet(ruleSet);
  return {
    hardRules: compiled.hardRules,
    softRules: compiled.softRules,
    objectiveWeights: compiled.objectiveWeights,
  };
}

export function isOneShiftPerDayFeasible(
  assignedInCore: Set<string>,
  assignedInExtra: Set<string>,
  candidateId: string
): boolean {
  if (!candidateId || candidateId === '__locked__') return false;
  if (assignedInCore.has(candidateId)) return false;
  if (assignedInExtra.has(candidateId)) return false;
  return true;
}
