import type { Slot } from '../shiftplan/types';

export interface HardFeasibilityInput {
  day: number;
  slot: Slot;
  candidateId: string;
  offByDay: Record<number, Set<string>>;
  extraAssignedByDay: Record<number, Set<string>>;
}

export function isHardFeasible(input: HardFeasibilityInput): boolean {
  const { day, slot, candidateId, offByDay, extraAssignedByDay } = input;
  if (!candidateId || candidateId === '__locked__') return false;
  if (offByDay[day]?.has(candidateId)) return false;
  if (extraAssignedByDay[day]?.has(candidateId)) return false;
  if (slot.f1 === candidateId || slot.f2 === candidateId || slot.sec === candidateId || slot.thi === candidateId) return false;
  return true;
}

export function deltaSoftScore(previousCost: number, nextCost: number): number {
  return nextCost - previousCost;
}
