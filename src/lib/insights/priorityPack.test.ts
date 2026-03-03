import test from 'node:test';
import assert from 'node:assert/strict';
import type { Person } from '../shiftplan/types';
import { buildPriorityPack, mergeCumulativeWeights } from './priorityPack';

const people: Person[] = [
    { id: 'p1', name: 'A', color: '#111', tagIds: ['second_call'] },
    { id: 'p2', name: 'B', color: '#222', tagIds: ['second_call'] },
    { id: 'p3', name: 'C', color: '#333', tagIds: ['third_call'] },
];

test('buildPriorityPack classifies below/near/above peers from median', () => {
    const pack = buildPriorityPack({
        monthKey: '2026-03',
        people,
        includedSet: new Set(['p1', 'p2', 'p3']),
        cumulativeTotals: { p1: 2, p2: 4, p3: 8 },
        schedulingConfig: null,
        createdAt: 1,
    });

    assert.equal(pack.medianTotal, 4);
    assert.equal(pack.bandByPersonId.p1, 'below_peers');
    assert.equal(pack.bandByPersonId.p2, 'near_peers');
    assert.equal(pack.bandByPersonId.p3, 'above_peers');
    assert.equal(pack.weightAdjustments.p1, -0.8);
    assert.equal(pack.weightAdjustments.p2, 0);
    assert.equal(pack.weightAdjustments.p3, 0.4);
});

test('buildPriorityPack gives near peers when totals are equal', () => {
    const pack = buildPriorityPack({
        monthKey: '2026-03',
        people,
        includedSet: new Set(['p1', 'p2', 'p3']),
        cumulativeTotals: { p1: 5, p2: 5, p3: 5 },
        schedulingConfig: null,
    });
    assert.equal(pack.bandByPersonId.p1, 'near_peers');
    assert.equal(pack.bandByPersonId.p2, 'near_peers');
    assert.equal(pack.bandByPersonId.p3, 'near_peers');
});

test('buildPriorityPack returns empty pack for no eligible people', () => {
    const pack = buildPriorityPack({
        monthKey: '2026-03',
        people: [{ id: 'x', name: 'X', color: '#000', tagIds: ['first_call'] }],
        includedSet: new Set(['x']),
        cumulativeTotals: { x: 3 },
        schedulingConfig: null,
    });
    assert.equal(pack.eligibleCount, 0);
    assert.deepEqual(pack.weightAdjustments, {});
});

test('mergeCumulativeWeights merges and adds unknown ids', () => {
    const merged = mergeCumulativeWeights(
        { p1: -1.2, p2: 0.1 },
        { p1: -0.8, p3: 0.4 },
    );
    assert.deepEqual(merged, { p1: -2, p2: 0.1, p3: 0.4 });
});
