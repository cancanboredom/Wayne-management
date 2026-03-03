import test from 'node:test';
import assert from 'node:assert/strict';
import { getCombinedSemanticTokens, getPrimarySemanticTag, getSemanticAccents, getTagThemeId } from './semanticColors';

test('single tag resolves to single mode', () => {
    const tokens = getCombinedSemanticTokens({ slot: 'second_call', tagIds: ['r2sry'] });
    assert.equal(tokens.mode, 'single');
    assert.equal(tokens.baseTone, 'second_call');
});

test('multi tag second_call resolves to mixed mode with stable accent themes', () => {
    const a = getCombinedSemanticTokens({ slot: 'second_call', tagIds: ['r3sry', 'r1sry', 'r2sry'] });
    const b = getCombinedSemanticTokens({ slot: 'second_call', tagIds: ['r2sry', 'r3sry', 'r1sry'] });
    assert.equal(a.mode, 'mixed');
    assert.deepEqual(a.accentThemes, b.accentThemes);
});

test('r1sir and r1sry have distinct themes', () => {
    assert.equal(getTagThemeId('r1sir'), 'r1sir');
    assert.equal(getTagThemeId('r1sry'), 'r1sry');
    assert.notEqual(getTagThemeId('r1sir'), getTagThemeId('r1sry'));
});

test('tag priority and accents are deterministic', () => {
    const primary = getPrimarySemanticTag(['intern', 'r3sry', 'r1sir', 'r2sir']);
    assert.equal(primary, 'r1sir');

    const accents = getSemanticAccents(['r3sry', 'r1sir', 'r2sir', 'r3sir'], 2);
    assert.deepEqual(accents, ['r1sir', 'r2sir']);
});
