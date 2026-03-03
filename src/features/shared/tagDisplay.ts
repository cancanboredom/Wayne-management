import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import type { WorkspaceSchedulingConfig } from '../../lib/scheduling/types';
import {
    getCombinedSemanticTokens,
    getToneForCallTag,
    getToneForCombo,
    getToneSoftClass,
    getToneSolidClass,
} from './semanticColors';
import { CALL_TAG_IDS as PERSON_CALL_TAG_IDS } from './personTagModel';

export type CallTagId = typeof PERSON_CALL_TAG_IDS[number];
export type CallComboKey = 'first' | 'second' | 'third' | 'first+second' | 'second+third' | 'first+third' | 'all' | 'other';

export type DisplayTag = {
    id: string;
    labelEnTh: string;
    shortLabel: string;
    colorClass: string;
};

export const CALL_TAG_IDS: CallTagId[] = [...PERSON_CALL_TAG_IDS];

export const CALL_TAG_DISPLAY: Record<CallTagId, { label: string; solidClass: string; softClass: string }> = {
    first_call: {
        label: '1st Call',
        solidClass: getToneSolidClass(getToneForCallTag('first_call')),
        softClass: getToneSoftClass(getToneForCallTag('first_call')),
    },
    second_call: {
        label: '2nd Call',
        solidClass: getToneSolidClass(getToneForCallTag('second_call')),
        softClass: getToneSoftClass(getToneForCallTag('second_call')),
    },
    third_call: {
        label: '3rd Call',
        solidClass: getToneSolidClass(getToneForCallTag('third_call')),
        softClass: getToneSoftClass(getToneForCallTag('third_call')),
    },
};

export const CALL_COMBO_ORDER: CallComboKey[] = ['all', 'first+second', 'second+third', 'first+third', 'first', 'second', 'third', 'other'];

export const CALL_COMBO_DISPLAY: Record<CallComboKey, { label: string; badgeClass: string; headerClass: string }> = {
    all: {
        label: '1st + 2nd + 3rd',
        badgeClass: getToneSoftClass(getToneForCombo('all')),
        headerClass: getToneSoftClass(getToneForCombo('all')),
    },
    'first+second': {
        label: '1st + 2nd',
        badgeClass: getToneSoftClass(getToneForCombo('first+second')),
        headerClass: getToneSoftClass(getToneForCombo('first+second')),
    },
    'second+third': {
        label: '2nd + 3rd',
        badgeClass: getToneSoftClass(getToneForCombo('second+third')),
        headerClass: getToneSoftClass(getToneForCombo('second+third')),
    },
    'first+third': {
        label: '1st + 3rd',
        badgeClass: getToneSoftClass(getToneForCombo('first+third')),
        headerClass: getToneSoftClass(getToneForCombo('first+third')),
    },
    first: {
        label: '1st Call',
        badgeClass: getToneSoftClass(getToneForCombo('first')),
        headerClass: getToneSoftClass(getToneForCombo('first')),
    },
    second: {
        label: '2nd Call',
        badgeClass: getToneSoftClass(getToneForCombo('second')),
        headerClass: getToneSoftClass(getToneForCombo('second')),
    },
    third: {
        label: '3rd Call',
        badgeClass: getToneSoftClass(getToneForCombo('third')),
        headerClass: getToneSoftClass(getToneForCombo('third')),
    },
    other: {
        label: 'Other',
        badgeClass: getToneSoftClass(getToneForCombo('other')),
        headerClass: getToneSoftClass(getToneForCombo('other')),
    },
};

const SUBSET_LABEL_OVERRIDES: Record<string, string> = {
    intern: 'Intern',
    other: 'Other อื่นๆ',
};

type SubsetSource = { id: string; name: string; color?: string };

function resolveSubsets(config?: WorkspaceSchedulingConfig | null): SubsetSource[] {
    const fromConfig = (config?.subsets || [])
        .filter(s => s.active !== false)
        .map(s => ({
            id: s.id,
            name: s.name,
            color: '#e5e7eb',
        }));
    return fromConfig.length > 0 ? fromConfig : DEFAULT_SUBSETS;
}

export function getSubsetOptions(config?: WorkspaceSchedulingConfig | null): DisplayTag[] {
    return resolveSubsets(config)
        .filter(sub => sub.id !== 'other')
        .map(sub => ({
            id: sub.id,
            labelEnTh: SUBSET_LABEL_OVERRIDES[sub.id] || sub.name,
            shortLabel: (SUBSET_LABEL_OVERRIDES[sub.id] || sub.name).split(' ')[0] || sub.name,
            colorClass: 'border-gray-200',
        }));
}

export const SUBSET_OPTIONS: DisplayTag[] = getSubsetOptions();

export function getSubsetIdSet(config?: WorkspaceSchedulingConfig | null): Set<string> {
    return new Set(resolveSubsets(config).map(sub => sub.id));
}

export function getCallComboKey(tagIds: string[]): CallComboKey {
    const hasFirst = tagIds.includes('first_call');
    const hasSecond = tagIds.includes('second_call');
    const hasThird = tagIds.includes('third_call');
    if (hasFirst && hasSecond && hasThird) return 'all';
    if (hasFirst && hasSecond) return 'first+second';
    if (hasSecond && hasThird) return 'second+third';
    if (hasFirst && hasThird) return 'first+third';
    if (hasFirst) return 'first';
    if (hasSecond) return 'second';
    if (hasThird) return 'third';
    return 'other';
}

export function getCallComboTokens(comboKey: CallComboKey) {
    const slot: 'second_call' | 'third_call' | undefined = comboKey === 'second+third'
        ? 'second_call'
        : comboKey === 'third'
            ? 'third_call'
            : comboKey === 'second'
                ? 'second_call'
                : undefined;
    const comboTags = comboKey === 'second+third' ? ['r2sry', 'r3sry'] : [];
    return getCombinedSemanticTokens({ slot, tagIds: comboTags });
}

export function getPrimarySubsetId(tagIds: string[], config?: WorkspaceSchedulingConfig | null): string | null {
    const subset = resolveSubsets(config).find(sub => tagIds.includes(sub.id) && sub.id !== 'other');
    return subset?.id || null;
}

export function getSubsetDisplay(tagIds: string[], config?: WorkspaceSchedulingConfig | null): { id: string; labelEnTh: string; color: string } | null {
    const subsetId = getPrimarySubsetId(tagIds, config);
    if (!subsetId) return null;
    const subset = resolveSubsets(config).find(sub => sub.id === subsetId);
    if (!subset) return null;
    return {
        id: subset.id,
        labelEnTh: SUBSET_LABEL_OVERRIDES[subset.id] || subset.name,
        color: subset.color || '#e5e7eb',
    };
}

export function replaceSubsetTag(tagIds: string[], subsetId: string | null, config?: WorkspaceSchedulingConfig | null): string[] {
    const subsetIdSet = getSubsetIdSet(config);
    const base = tagIds.filter(tag => !subsetIdSet.has(tag));
    if (!subsetId || subsetId === 'none') return base;
    return [...base, subsetId];
}
