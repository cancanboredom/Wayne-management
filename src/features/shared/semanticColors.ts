import type { CSSProperties } from 'react';
import type { CallComboKey, CallTagId } from './tagDisplay';

export type SlotId = 'first_call' | 'second_call' | 'third_call';
export type SemanticMode = 'single' | 'mixed';
export type TagThemeId =
    | 'intern'
    | 'r1sry'
    | 'r1sir'
    | 'r2sry'
    | 'r3sry'
    | 'r2sir'
    | 'r3sir'
    | 'other'
    | 'first_call'
    | 'second_call'
    | 'third_call'
    | 'custom';

export interface TagThemeTokens {
    softClass: string;
    solidClass: string;
    textClass: string;
    ringClass: string;
    accentRgb: string;
    chipVariant: 'neutral' | 'blue' | 'violet' | 'emerald' | 'fuchsia' | 'rose' | 'amber' | 'red' | 'indigo';
}

export interface CombinedSemanticTokens {
    mode: SemanticMode;
    baseTone: TagThemeId;
    accentThemes: TagThemeId[];
    softBg: string;
    border: string;
    text: string;
    chipVariant: TagThemeTokens['chipVariant'];
    stripeCss: CSSProperties;
    ring: string;
}

const SEMANTIC_PRIORITY_RULES: Array<{ test: (tagId: string) => boolean; priority: number }> = [
    { test: (tagId) => /^r1/.test(tagId), priority: 10 },
    { test: (tagId) => /^r2/.test(tagId), priority: 20 },
    { test: (tagId) => /^r3/.test(tagId), priority: 30 },
    { test: (tagId) => tagId === 'intern', priority: 40 },
    { test: (tagId) => tagId === 'other', priority: 90 },
];

const themeByTag: Record<string, TagThemeId> = {
    intern: 'intern',
    r1sry: 'r1sry',
    r1sir: 'r1sir',
    r2sry: 'r2sry',
    r2sir: 'r2sir',
    r3sry: 'r3sry',
    r3sir: 'r3sir',
    other: 'other',
    first_call: 'first_call',
    second_call: 'second_call',
    third_call: 'third_call',
};

const themeBySlot: Record<SlotId, TagThemeId> = {
    first_call: 'first_call',
    second_call: 'second_call',
    third_call: 'third_call',
};

const TOKENS: Record<TagThemeId, TagThemeTokens> = {
    intern: {
        softClass: 'bg-rose-50 text-rose-700 border-rose-200',
        solidClass: 'bg-rose-600 text-white border-rose-600',
        textClass: 'text-rose-700',
        ringClass: 'focus-visible:ring-rose-300',
        accentRgb: '244 63 94',
        chipVariant: 'rose',
    },
    r1sry: {
        softClass: 'bg-amber-50 text-amber-700 border-amber-200',
        solidClass: 'bg-amber-600 text-white border-amber-600',
        textClass: 'text-amber-700',
        ringClass: 'focus-visible:ring-amber-300',
        accentRgb: '245 158 11',
        chipVariant: 'amber',
    },
    r1sir: {
        softClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        solidClass: 'bg-emerald-600 text-white border-emerald-600',
        textClass: 'text-emerald-700',
        ringClass: 'focus-visible:ring-emerald-300',
        accentRgb: '16 185 129',
        chipVariant: 'emerald',
    },
    r2sry: {
        softClass: 'bg-blue-50 text-blue-700 border-blue-200',
        solidClass: 'bg-blue-600 text-white border-blue-600',
        textClass: 'text-blue-700',
        ringClass: 'focus-visible:ring-blue-300',
        accentRgb: '59 130 246',
        chipVariant: 'blue',
    },
    r3sry: {
        softClass: 'bg-violet-50 text-violet-700 border-violet-200',
        solidClass: 'bg-violet-600 text-white border-violet-600',
        textClass: 'text-violet-700',
        ringClass: 'focus-visible:ring-violet-300',
        accentRgb: '139 92 246',
        chipVariant: 'violet',
    },
    r2sir: {
        softClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        solidClass: 'bg-cyan-600 text-white border-cyan-600',
        textClass: 'text-cyan-700',
        ringClass: 'focus-visible:ring-cyan-300',
        accentRgb: '6 182 212',
        chipVariant: 'blue',
    },
    r3sir: {
        softClass: 'bg-orange-50 text-orange-700 border-orange-200',
        solidClass: 'bg-orange-600 text-white border-orange-600',
        textClass: 'text-orange-700',
        ringClass: 'focus-visible:ring-orange-300',
        accentRgb: '249 115 22',
        chipVariant: 'amber',
    },
    other: {
        softClass: 'bg-gray-50 text-gray-700 border-gray-200',
        solidClass: 'bg-gray-700 text-white border-gray-700',
        textClass: 'text-gray-700',
        ringClass: 'focus-visible:ring-gray-300',
        accentRgb: '148 163 184',
        chipVariant: 'neutral',
    },
    first_call: {
        softClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        solidClass: 'bg-emerald-600 text-white border-emerald-600',
        textClass: 'text-emerald-700',
        ringClass: 'focus-visible:ring-emerald-300',
        accentRgb: '16 185 129',
        chipVariant: 'emerald',
    },
    second_call: {
        softClass: 'bg-amber-50 text-amber-700 border-amber-200',
        solidClass: 'bg-amber-600 text-white border-amber-600',
        textClass: 'text-amber-700',
        ringClass: 'focus-visible:ring-amber-300',
        accentRgb: '245 158 11',
        chipVariant: 'amber',
    },
    third_call: {
        softClass: 'bg-blue-50 text-blue-700 border-blue-200',
        solidClass: 'bg-blue-600 text-white border-blue-600',
        textClass: 'text-blue-700',
        ringClass: 'focus-visible:ring-blue-300',
        accentRgb: '59 130 246',
        chipVariant: 'blue',
    },
    custom: {
        softClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        solidClass: 'bg-indigo-600 text-white border-indigo-600',
        textClass: 'text-indigo-700',
        ringClass: 'focus-visible:ring-indigo-300',
        accentRgb: '99 102 241',
        chipVariant: 'indigo',
    },
};

function getTagPriority(tagId: string): number {
    const matched = SEMANTIC_PRIORITY_RULES.find((rule) => rule.test(tagId));
    return matched ? matched.priority : 60;
}

function sortTagIds(tagIds: string[]): string[] {
    return [...new Set(tagIds.filter(Boolean))].sort((a, b) => {
        const pa = getTagPriority(a);
        const pb = getTagPriority(b);
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
    });
}

export function getTagThemeId(tagId: string): TagThemeId {
    return themeByTag[tagId] || 'custom';
}

export function getTagThemeTokens(tagId: string): TagThemeTokens {
    return TOKENS[getTagThemeId(tagId)];
}

export function getPrimarySemanticTag(tagIds: string[]): string | null {
    const sorted = sortTagIds(tagIds);
    return sorted[0] || null;
}

export function getSemanticAccents(tagIds: string[], limit = 2): string[] {
    const seen = new Set<TagThemeId>();
    const accents: string[] = [];
    for (const tagId of sortTagIds(tagIds)) {
        const theme = getTagThemeId(tagId);
        if (seen.has(theme)) continue;
        seen.add(theme);
        accents.push(tagId);
        if (accents.length >= limit) break;
    }
    return accents;
}

export function getSlotTone(slot?: SlotId): TagThemeId {
    return slot ? themeBySlot[slot] : 'other';
}

export function getToneSoftClass(tone: TagThemeId): string {
    return TOKENS[tone].softClass;
}

export function getToneSolidClass(tone: TagThemeId): string {
    return TOKENS[tone].solidClass;
}

export function getToneTextClass(tone: TagThemeId): string {
    return TOKENS[tone].textClass;
}

export function getToneRingClass(tone: TagThemeId): string {
    return TOKENS[tone].ringClass;
}

export function getToneForTag(tagId: string): TagThemeId {
    return getTagThemeId(tagId);
}

export function getToneForCallTag(tagId: CallTagId): TagThemeId {
    return getTagThemeId(tagId);
}

export function getToneForCombo(comboKey: CallComboKey): TagThemeId {
    if (comboKey === 'all') return 'custom';
    if (comboKey === 'first+second') return 'first_call';
    if (comboKey === 'second+third') return 'second_call';
    if (comboKey === 'first+third') return 'third_call';
    if (comboKey === 'first') return 'first_call';
    if (comboKey === 'second') return 'second_call';
    if (comboKey === 'third') return 'third_call';
    return 'other';
}

export function getCombinedSemanticTokens(input: { slot?: SlotId; tagIds: string[]; subsetId?: string | null }): CombinedSemanticTokens {
    const orderedTagIds = sortTagIds([
        ...(input.subsetId ? [input.subsetId] : []),
        ...input.tagIds,
    ]);

    const baseTone = input.slot ? getSlotTone(input.slot) : getTagThemeId(orderedTagIds[0] || 'other');
    const shouldUseMixed = (input.slot === 'second_call' || input.slot === 'third_call') && orderedTagIds.length > 1;
    const accentTags = shouldUseMixed ? getSemanticAccents(orderedTagIds, 2) : [];
    const accentThemes = accentTags.map((tagId) => getTagThemeId(tagId));

    const baseTokens = TOKENS[baseTone];
    const accentOne = TOKENS[accentThemes[0] || baseTone];
    const accentTwo = TOKENS[accentThemes[1] || accentThemes[0] || baseTone];

    const stripeCss: CSSProperties = {
        '--semantic-accent-1': accentOne.accentRgb,
        '--semantic-accent-2': accentTwo.accentRgb,
        '--semantic-mixed-bg': baseTokens.accentRgb,
        '--semantic-mixed-border': accentOne.accentRgb,
    } as CSSProperties;

    return {
        mode: shouldUseMixed ? 'mixed' : 'single',
        baseTone,
        accentThemes,
        softBg: baseTokens.softClass,
        border: baseTokens.softClass,
        text: baseTokens.textClass,
        chipVariant: baseTokens.chipVariant,
        stripeCss,
        ring: baseTokens.ringClass,
    };
}
