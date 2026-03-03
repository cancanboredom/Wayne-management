import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import {
  countRuleGroupTags,
  getRuleGroupTagIds,
  normalizePersonTags,
  splitPersonTags,
} from './personTagModel';

test('getRuleGroupTagIds falls back to default subsets', () => {
  const ids = getRuleGroupTagIds(null);
  assert.deepEqual(ids, DEFAULT_SUBSETS.map((subset) => subset.id));
});

test('splitPersonTags classifies call/rule-group/other and dedupes', () => {
  const split = splitPersonTags(
    ['second_call', 'intern', 'intern', 'custom_x', 'third_call', 'custom_x'],
    null
  );
  assert.deepEqual(split.callTags, ['second_call', 'third_call']);
  assert.deepEqual(split.ruleGroupTags, ['intern']);
  assert.deepEqual(split.otherTags, ['custom_x']);
});

test('normalizePersonTags keeps all call tags and one rule group tag', () => {
  const normalized = normalizePersonTags(
    ['third_call', 'r2sir', 'second_call', 'intern', 'custom_x'],
    null,
    { singleRuleGroup: true }
  );
  assert.deepEqual(normalized, ['third_call', 'second_call', 'intern', 'custom_x']);
});

test('countRuleGroupTags returns total before normalization', () => {
  const count = countRuleGroupTags(['intern', 'r1sir', 'second_call'], null);
  assert.equal(count, 2);
});
