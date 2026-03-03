import type { Person, Shift } from '../shiftplan/types';

export function buildShiftsByDateIndex(shifts: Shift[]): Map<string, Shift[]> {
  const map = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const bucket = map.get(shift.date);
    if (bucket) bucket.push(shift);
    else map.set(shift.date, [shift]);
  }
  return map;
}

export function buildPeopleByIdIndex(people: Person[]): Map<string, Person> {
  return new Map(people.map((person) => [person.id, person]));
}

export function buildMonthShiftsByPersonIndex(shifts: Shift[]): Map<string, Shift[]> {
  const map = new Map<string, Shift[]>();
  for (const shift of shifts) {
    if (!shift.personId || shift.personId === '__locked__') continue;
    const bucket = map.get(shift.personId);
    if (bucket) bucket.push(shift);
    else map.set(shift.personId, [shift]);
  }
  return map;
}
