import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckSquare, Lock, Plus, RefreshCw, Settings2, ShieldAlert, Tag, Trash2, Users } from 'lucide-react';
import { useConfigStore } from '../../lib/store/useConfigStore';
import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import type { Holiday, Person, Shift, Tag as AppTag } from '../../lib/shiftplan/types';
import type {
    WorkspaceFairnessCohort,
    WorkspaceRuleTemplate,
    WorkspaceSchedulingConfig,
    WorkspaceSubsetDefinition,
} from '../../lib/scheduling/types';
import { computeTagAudit } from '../../lib/scheduling/tagAudit';
import { useUIStore } from '../../lib/store/useUIStore';
import {
    apiFetch,
    ensureApiSuccess,
    isPreviewReadonlyError,
    PREVIEW_READONLY_MESSAGE,
} from '../../lib/workspaceApi';
import { getCombinedSemanticTokens } from '../shared/semanticColors';
import SurfaceBadge from '../../components/ui/SurfaceBadge';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { featureFlags } from '../../config/flags';
import SegmentTabs from '../../components/mobile/SegmentTabs';

const SLOT_OPTIONS = ['1A', '1B', '2', '3'] as const;
type SlotOption = typeof SLOT_OPTIONS[number];

const DAY_CLASS_OPTIONS = [
    { value: 'all', label: 'All days' },
    { value: 'holiday', label: 'Holiday' },
    { value: 'weekday', label: 'Weekday' },
    { value: 'noon', label: 'Noon' },
] as const;

function normalizeTagId(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

function buildFallbackSubsets(): WorkspaceSubsetDefinition[] {
    return DEFAULT_SUBSETS.map((s, idx) => ({
        id: s.id,
        name: s.name,
        tagIds: [s.id],
        levelScopes: [
            ...(s.eligible1st ? ['1A', '1B'] : []),
            ...(s.eligible2nd ? ['2'] : []),
            ...(s.eligible3rd ? ['3'] : []),
        ],
        active: true,
        priority: s.summaryOrder ?? idx + 1,
    }));
}

function defaultRuleTemplates(): WorkspaceRuleTemplate[] {
    return [{
        id: 'single-shift',
        type: 'single_shift_per_day',
        enabled: true,
        hard: true,
        params: { scope: 'all_levels' },
    }];
}

function defaultCohorts(): WorkspaceFairnessCohort[] {
    return [{
        id: 'cohort-2nd3rd-core',
        name: 'R2/R3 Core Balance',
        memberTagIds: ['r2sry', 'r3sry', 'r3sir'],
        slotScope: ['2', '3'],
        hardCapGap: 1,
        enforceTotal: true,
        enforceHoliday: true,
        enforceNoon: true,
        noonSlotScope: ['2'],
        enabled: true,
    }];
}

function makeEligibilityMap(ruleTemplates: WorkspaceRuleTemplate[] | undefined): Record<string, Set<SlotOption>> {
    const map: Record<string, Set<SlotOption>> = {};
    for (const template of ruleTemplates || []) {
        if (!template.enabled || template.type !== 'eligibility_by_tag') continue;
        const tagId = String(template.params?.tagId || '');
        const slot = String(template.params?.slot || '') as SlotOption;
        if (!tagId || !SLOT_OPTIONS.includes(slot)) continue;
        if (!map[tagId]) map[tagId] = new Set<SlotOption>();
        map[tagId].add(slot);
    }
    return map;
}

function upsertEligibilityTemplate(
    templates: WorkspaceRuleTemplate[],
    tagId: string,
    slot: SlotOption,
    enabled: boolean,
): WorkspaceRuleTemplate[] {
    const matches = (tpl: WorkspaceRuleTemplate) => tpl.type === 'eligibility_by_tag'
        && String(tpl.params?.tagId || '') === tagId
        && String(tpl.params?.slot || '') === slot;

    if (!enabled) return templates.filter((tpl) => !matches(tpl));
    if (templates.some((tpl) => matches(tpl))) return templates;

    return [
        ...templates,
        {
            id: `elig-${tagId}-${slot.toLowerCase()}`,
            type: 'eligibility_by_tag',
            enabled: true,
            hard: true,
            params: { tagId, slot },
        },
    ];
}

function stripTagReferences(
    templates: WorkspaceRuleTemplate[],
    cohorts: WorkspaceFairnessCohort[],
    tagId: string,
): { templates: WorkspaceRuleTemplate[]; cohorts: WorkspaceFairnessCohort[] } {
    const nextTemplates = templates.filter((tpl) => {
        const params = tpl.params || {};
        if (tpl.type === 'eligibility_by_tag') return String(params.tagId || '') !== tagId;
        if (tpl.type === 'count_limit') return String(params.tagId || '') !== tagId;
        if (tpl.type === 'sequence_gap') return String(params.tagId || '') !== tagId;
        if (tpl.type === 'pairing') {
            return String(params.primaryTagId || '') !== tagId && String(params.counterpartTagId || '') !== tagId;
        }
        if (tpl.type === 'fairness_cohort') {
            const memberTagIds = Array.isArray(params.memberTagIds) ? params.memberTagIds.map(String) : [];
            return !memberTagIds.includes(tagId);
        }
        return true;
    });

    const nextCohorts = cohorts
        .map((cohort) => ({
            ...cohort,
            memberTagIds: (cohort.memberTagIds || []).filter((id) => id !== tagId),
        }))
        .filter((cohort) => cohort.memberTagIds.length > 0);

    return { templates: nextTemplates, cohorts: nextCohorts };
}

function cleanTemplateParams(template: Partial<WorkspaceRuleTemplate>): WorkspaceRuleTemplate['params'] {
    const params = { ...(template.params || {}) };
    if (template.type === 'count_limit') {
        return {
            tagId: String(params.tagId || ''),
            min: params.min == null ? undefined : Number(params.min),
            max: params.max == null ? undefined : Number(params.max),
            exact: params.exact == null ? undefined : Number(params.exact),
            dayClass: String(params.dayClass || 'all'),
            slot: params.slot ? String(params.slot) : undefined,
        };
    }
    if (template.type === 'sequence_gap') {
        return {
            tagId: params.tagId ? String(params.tagId) : '',
            minGapDays: Number(params.minGapDays ?? 1),
            dayClass: String(params.dayClass || 'all'),
            slot: params.slot ? String(params.slot) : undefined,
        };
    }
    if (template.type === 'pairing') {
        return {
            primaryTagId: String(params.primaryTagId || ''),
            counterpartTagId: String(params.counterpartTagId || ''),
            mode: params.mode === 'cannot_pair_with' ? 'cannot_pair_with' : 'must_pair_with',
        };
    }
    if (template.type === 'single_shift_per_day') {
        return { scope: 'all_levels' };
    }
    return params;
}

function validateCohortDraft(draft: Partial<WorkspaceFairnessCohort>): string | null {
    if (!draft.id?.trim()) return 'Cohort id is required';
    if (!draft.name?.trim()) return 'Cohort name is required';
    if (!(draft.memberTagIds || []).length) return 'Pick at least one member tag';
    if (!(draft.slotScope || []).length) return 'Pick at least one slot in slot scope';
    return null;
}

export default function SettingsRules() {
    const { tags, setTags, holidays, setHolidays, schedulingConfig, setSchedulingConfig } = useConfigStore();
    const { isEditor, canMutate, isPreviewReadonly } = useUIStore();

    const [people, setPeople] = useState<Person[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [previewNotice, setPreviewNotice] = useState<string | null>(null);
    const [savingConfig, setSavingConfig] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(true);

    const [scanAt, setScanAt] = useState<number | null>(null);
    const [scanSafeTagIds, setScanSafeTagIds] = useState<string[]>([]);

    const [templateDraft, setTemplateDraft] = useState<Partial<WorkspaceRuleTemplate>>({
        id: '',
        type: 'count_limit',
        enabled: true,
        hard: true,
        params: { dayClass: 'all' },
    });

    const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
    const [cohortDraft, setCohortDraft] = useState<Partial<WorkspaceFairnessCohort> | null>(null);
    const [cohortError, setCohortError] = useState<string | null>(null);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [stateNoonDays, setStateNoonDays] = useState<string[]>([]);
    const [mobileTab, setMobileTab] = useState<'tags' | 'eligibility' | 'cohorts' | 'holidays'>('tags');
    const pageGradient = getGradientRecipe('rules', 'page-bg');
    const isMobileV2 = featureFlags.mobileV2;
    const secondPoolTokens = getCombinedSemanticTokens({ slot: 'second_call', tagIds: ['r1sry', 'r2sry', 'r3sry', 'intern'] });
    const thirdPoolTokens = getCombinedSemanticTokens({ slot: 'third_call', tagIds: ['r2sry', 'r3sry', 'r3sir'] });

    useEffect(() => {
        apiFetch('/api/holidays')
            .then((r) => r.json())
            .then((data) => setHolidays(data.holidays || []))
            .catch(console.error);

        apiFetch('/api/state')
            .then((r) => r.json())
            .then((data) => {
                setPeople(data.people || []);
                setShifts(data.shifts || []);
                setStateNoonDays(data.noonDays || []);
                if (data.schedulingConfig) {
                    setSchedulingConfig(data.schedulingConfig);
                    setTags((data.schedulingConfig.tags || []).map((t: any) => ({
                        id: t.id,
                        name: t.label,
                        color: t.color,
                    })));
                }
            })
            .catch(console.error);
    }, [setHolidays, setSchedulingConfig, setTags]);

    const showPreviewNotice = () => {
        setPreviewNotice(PREVIEW_READONLY_MESSAGE);
        setTimeout(() => setPreviewNotice(null), 3000);
    };

    const handleMutationError = (err: unknown) => {
        if (isPreviewReadonlyError(err)) {
            showPreviewNotice();
            return;
        }
        console.error(err);
    };

    const buildConfigPayload = (
        nextTags: AppTag[],
        nextTemplates?: WorkspaceRuleTemplate[],
        nextCohorts?: WorkspaceFairnessCohort[],
        nextSubsets?: WorkspaceSubsetDefinition[],
    ): WorkspaceSchedulingConfig => ({
        version: schedulingConfig?.version || 1,
        tags: nextTags.map((t) => ({ id: t.id, label: t.name, color: t.color, active: true })),
        subsets: nextSubsets || schedulingConfig?.subsets || buildFallbackSubsets(),
        ruleTemplates: nextTemplates || schedulingConfig?.ruleTemplates || defaultRuleTemplates(),
        fairnessCohorts: nextCohorts || schedulingConfig?.fairnessCohorts || defaultCohorts(),
        updatedAt: Date.now(),
    });

    const persistSchedulingConfig = async (payload: WorkspaceSchedulingConfig) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        setSavingConfig(true);
        try {
            const workspaceId = localStorage.getItem('wayne_workspace_id') || 'default';
            const res = await apiFetch(`/api/workspaces/${workspaceId}/scheduling-config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: payload }),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            if (data.config) {
                setSchedulingConfig(data.config);
                setTags((data.config.tags || []).map((t: any) => ({
                    id: t.id,
                    name: t.label,
                    color: t.color,
                })));
            }
        } catch (err) {
            handleMutationError(err);
        } finally {
            setSavingConfig(false);
        }
    };

    const tagAudit = useMemo(() => computeTagAudit(
        tags.map((t) => t.id),
        people,
        schedulingConfig,
    ), [tags, people, schedulingConfig]);

    const cohortLiveGaps = useMemo(() => {
        const noonSet = new Set(stateNoonDays || []);
        const holidaySet = new Set((holidays || []).map((h) => h.date));
        const isWeekendDate = (dateStr: string) => {
            const d = new Date(`${dateStr}T00:00:00`);
            const dow = d.getDay();
            return dow === 0 || dow === 6;
        };
        const result: Record<string, { holidayGap: number; noonGap: number }> = {};
        for (const cohort of schedulingConfig?.fairnessCohorts || []) {
            const memberIds = people
                .filter((p) => (p.tagIds || []).some((tid) => (cohort.memberTagIds || []).includes(tid)))
                .map((p) => p.id);
            const memberSet = new Set(memberIds);
            const slotScope = new Set((cohort.slotScope || []).map(String));
            const noonSlotScope = new Set(((cohort.noonSlotScope || []).length ? cohort.noonSlotScope : cohort.slotScope || []).map(String));
            const holidayCounts: Record<string, number> = {};
            const noonCounts: Record<string, number> = {};
            memberIds.forEach((id) => {
                holidayCounts[id] = 0;
                noonCounts[id] = 0;
            });
            for (const s of shifts || []) {
                if (!memberSet.has(s.personId)) continue;
                const isNoon = noonSet.has(s.date);
                const isHoliday = (holidaySet.has(s.date) || isWeekendDate(s.date)) && !isNoon;
                if (isHoliday && cohort.enforceHoliday !== false && slotScope.has(s.level)) holidayCounts[s.personId] += 1;
                if (isNoon && cohort.enforceNoon !== false && noonSlotScope.has(s.level)) noonCounts[s.personId] += 1;
            }
            const holidayVals = Object.values(holidayCounts);
            const noonVals = Object.values(noonCounts);
            result[cohort.id] = {
                holidayGap: holidayVals.length > 1 ? Math.max(...holidayVals) - Math.min(...holidayVals) : 0,
                noonGap: noonVals.length > 1 ? Math.max(...noonVals) - Math.min(...noonVals) : 0,
            };
        }
        return result;
    }, [stateNoonDays, holidays, schedulingConfig?.fairnessCohorts, people, shifts]);

    useEffect(() => {
        if (scanAt == null && tags.length > 0) {
            setScanSafeTagIds(tagAudit.safeToRemoveTagIds);
            setScanAt(Date.now());
        }
    }, [scanAt, tagAudit.safeToRemoveTagIds, tags.length]);

    const scanUnusedTags = () => {
        setScanSafeTagIds(tagAudit.safeToRemoveTagIds);
        setScanAt(Date.now());
    };

    const addTagAndPersist = async () => {
        const raw = newTagName.trim();
        if (!raw) return;
        const id = normalizeTagId(raw);
        if (!id) return;
        if (tags.some((t) => t.id === id)) {
            setNewTagName('');
            return;
        }
        const nextTags = [...tags, { id, name: raw, color: 'bg-indigo-50 text-indigo-700' }];
        setTags(nextTags);
        setNewTagName('');
        await persistSchedulingConfig(buildConfigPayload(nextTags));
    };

    const removeTagAndPersist = async (tagId: string) => {
        const nextTags = tags.filter((t) => t.id !== tagId);
        setTags(nextTags);

        const nextSubsets = (schedulingConfig?.subsets || []).map((s) => ({
            ...s,
            tagIds: (s.tagIds || []).filter((id) => id !== tagId),
        }));

        const { templates, cohorts } = stripTagReferences(
            schedulingConfig?.ruleTemplates || [],
            schedulingConfig?.fairnessCohorts || [],
            tagId,
        );

        await persistSchedulingConfig(buildConfigPayload(nextTags, templates, cohorts, nextSubsets));
        setScanSafeTagIds((prev) => prev.filter((id) => id !== tagId));
    };

    const toggleEligibility = async (tagId: string, slot: SlotOption, enabled: boolean) => {
        const currentTemplates = schedulingConfig?.ruleTemplates || defaultRuleTemplates();
        const nextTemplates = upsertEligibilityTemplate(currentTemplates, tagId, slot, enabled);
        await persistSchedulingConfig(buildConfigPayload(tags, nextTemplates, schedulingConfig?.fairnessCohorts || defaultCohorts()));
    };

    const startNewCohort = () => {
        setEditingCohortId(null);
        setCohortError(null);
        setCohortDraft({
            id: '',
            name: '',
            memberTagIds: [],
            slotScope: ['2', '3'],
            hardCapGap: 1,
            enforceTotal: true,
            enforceHoliday: true,
            enforceNoon: true,
            noonSlotScope: ['2'],
            enabled: true,
        });
    };

    const startEditCohort = (cohort: WorkspaceFairnessCohort) => {
        setEditingCohortId(cohort.id);
        setCohortError(null);
        setCohortDraft({ ...cohort });
    };

    const saveCohort = async () => {
        if (!cohortDraft) return;
        const error = validateCohortDraft(cohortDraft);
        if (error) {
            setCohortError(error);
            return;
        }
        const normalized: WorkspaceFairnessCohort = {
            id: cohortDraft.id!.trim(),
            name: cohortDraft.name!.trim(),
            memberTagIds: [...new Set((cohortDraft.memberTagIds || []).filter(Boolean))],
            slotScope: (cohortDraft.slotScope || []).filter(Boolean) as SlotOption[],
            hardCapGap: 1,
            enforceTotal: cohortDraft.enforceTotal !== false,
            enforceHoliday: cohortDraft.enforceHoliday !== false,
            enforceNoon: cohortDraft.enforceNoon !== false,
            noonSlotScope: (cohortDraft.noonSlotScope || []).filter(Boolean) as SlotOption[],
            enabled: cohortDraft.enabled !== false,
        };

        const nextCohorts = (schedulingConfig?.fairnessCohorts || []).filter((c) => c.id !== editingCohortId && c.id !== normalized.id);
        nextCohorts.push(normalized);

        await persistSchedulingConfig(buildConfigPayload(tags, schedulingConfig?.ruleTemplates || defaultRuleTemplates(), nextCohorts));
        setCohortDraft(null);
        setEditingCohortId(null);
        setCohortError(null);
    };

    const removeCohort = async (cohortId: string) => {
        const nextCohorts = (schedulingConfig?.fairnessCohorts || []).filter((c) => c.id !== cohortId);
        await persistSchedulingConfig(buildConfigPayload(tags, schedulingConfig?.ruleTemplates || defaultRuleTemplates(), nextCohorts));
        if (editingCohortId === cohortId) {
            setCohortDraft(null);
            setEditingCohortId(null);
            setCohortError(null);
        }
    };

    const saveTemplate = async () => {
        if (!templateDraft.type) return;
        const id = (templateDraft.id || '').trim() || `tpl-${Date.now()}`;
        const type = templateDraft.type;
        const params = cleanTemplateParams(templateDraft);

        if (type === 'count_limit' && !String((params as any).tagId || '')) return;
        if (type === 'pairing' && (!String((params as any).primaryTagId || '') || !String((params as any).counterpartTagId || ''))) return;

        const nextTemplate: WorkspaceRuleTemplate = {
            id,
            type,
            enabled: templateDraft.enabled !== false,
            hard: templateDraft.hard !== false,
            params,
            weight: templateDraft.weight == null ? undefined : Number(templateDraft.weight),
        };

        const current = schedulingConfig?.ruleTemplates || defaultRuleTemplates();
        const withoutSameId = current.filter((tpl) => tpl.id !== id);
        const nextTemplates = [...withoutSameId, nextTemplate];
        await persistSchedulingConfig(buildConfigPayload(tags, nextTemplates, schedulingConfig?.fairnessCohorts || defaultCohorts()));

        setTemplateDraft({
            id: '',
            type: 'count_limit',
            enabled: true,
            hard: true,
            params: { dayClass: 'all' },
        });
    };

    const removeTemplate = async (templateId: string) => {
        const nextTemplates = (schedulingConfig?.ruleTemplates || []).filter((tpl) => tpl.id !== templateId);
        await persistSchedulingConfig(buildConfigPayload(tags, nextTemplates, schedulingConfig?.fairnessCohorts || defaultCohorts()));
    };

    const eligibilityMap = useMemo(() => makeEligibilityMap(schedulingConfig?.ruleTemplates), [schedulingConfig?.ruleTemplates]);

    return (
        <div className="ui-page-root h-full min-h-0 p-4 md:p-6 flex flex-col gap-4 overflow-hidden" style={{ background: pageGradient.background }}>
            {previewNotice && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-sm font-bold shadow-sm">
                    {previewNotice}
                </div>
            )}
            {isPreviewReadonly && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                    แก้ไขได้ใน Editor mode (non-preview env)
                </div>
            )}

            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl caps-title flex items-center gap-2 text-gray-900">
                        <Settings2 className="w-5 h-5 text-emerald-600" />
                        Rules & Tags
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Tag-first setup: manage tags, eligibility matrix, and fairness cohorts.
                    </p>
                </div>
                <button
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="text-xs caps-ui px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                    {advancedOpen ? 'Hide Advanced Builder' : 'Show Advanced Builder'}
                </button>
            </div>
            {isMobileV2 && (
                <SegmentTabs
                    tabs={[
                        { id: 'tags', label: 'Tags' },
                        { id: 'eligibility', label: 'Eligibility' },
                        { id: 'cohorts', label: 'Cohorts' },
                        { id: 'holidays', label: 'Holidays' },
                    ]}
                    active={mobileTab}
                    onChange={(id) => setMobileTab(id as typeof mobileTab)}
                />
            )}

            <div className="min-h-0 flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 overflow-hidden">
                <section className={`xl:col-span-3 min-h-0 ui-panel rounded-xl p-4 flex flex-col overflow-hidden ${isMobileV2 && mobileTab !== 'tags' ? 'hidden md:flex' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-indigo-500" />
                        <h2 className="text-sm caps-title text-gray-900">Tag Manager</h2>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Add/remove tags and scan suggested cleanup from current DB state.</p>

                    {isEditor ? (
                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                placeholder="New tag name"
                                className="ui-input flex-1 px-3 py-1.5 rounded-lg text-sm"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTagAndPersist()}
                                disabled={!canMutate}
                            />
                            <button
                                onClick={addTagAndPersist}
                                disabled={!canMutate || savingConfig}
                                className="ui-btn ui-btn-accent px-3 py-1.5 rounded-lg text-sm caps-ui disabled:opacity-50"
                                title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-bold">
                            <Lock className="w-3 h-3" /> Guest mode - read only
                        </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                        <button
                            onClick={scanUnusedTags}
                            className="ui-btn ui-btn-neutral inline-flex items-center gap-2 px-3 py-1.5 text-xs caps-ui rounded-lg"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Scan Unused Tags
                        </button>
                        <span className="text-[11px] text-gray-400">
                            {scanAt ? `Last scan ${new Date(scanAt).toLocaleTimeString()}` : 'Not scanned'}
                        </span>
                    </div>

                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                        {tags.length === 0 ? (
                            <div className="text-xs text-gray-400 text-center py-6">No tags configured</div>
                        ) : tags.map((tag) => {
                            const audit = tagAudit.entries[tag.id];
                            const referenced = !!(audit?.referencedInRules || audit?.referencedInCohorts);
                            const safeToRemove = !!audit?.safeToRemove;
                            return (
                                <div key={tag.id} className="border border-gray-200 rounded-lg p-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                                                {tag.name}
                                                <SurfaceBadge tagIds={[tag.id]} miniLegend className="border">{tag.id}</SurfaceBadge>
                                            </div>
                                            <div className="text-[11px] text-gray-500 font-mono">{tag.id}</div>
                                        </div>
                                        {isEditor && (
                                            <button
                                                onClick={() => removeTagAndPersist(tag.id)}
                                                disabled={!canMutate || savingConfig}
                                                className="p-1.5 text-gray-400 hover:text-rose-600 disabled:opacity-40"
                                                title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">Used by {audit?.usedByPeople || 0} people</span>
                                        {referenced && (
                                            <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">Referenced in cohort/rules</span>
                                        )}
                                        {safeToRemove && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">Safe to remove</span>
                                        )}
                                    </div>
                                    {(audit?.subsetReferenceCount || 0) > 0 && safeToRemove && (
                                        <div className="mt-1 text-[11px] text-amber-700">Internal subset has mapping ({audit?.subsetReferenceCount})</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3 border-t border-gray-100 pt-3">
                        <h3 className="text-xs caps-micro text-gray-700">Suggested Cleanup</h3>
                        <p className="text-[11px] text-gray-500 mt-1">Scan result only. No automatic delete.</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {scanSafeTagIds.length === 0 ? (
                                <span className="text-xs text-gray-400">No cleanup candidates</span>
                            ) : scanSafeTagIds.map((tagId) => (
                                <span key={tagId} className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    {tagId}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={`xl:col-span-4 min-h-0 flex flex-col gap-4 overflow-hidden ${isMobileV2 && mobileTab !== 'eligibility' ? 'hidden md:flex' : ''}`}>
                    <div className="min-h-0 flex-1 ui-panel rounded-xl p-4 flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                            <h2 className="text-sm caps-title text-gray-900">Eligibility Matrix</h2>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Toggle `Tag x Slot` to maintain `eligibility_by_tag` templates directly.</p>

                        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
                            <table className="min-w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="text-left px-3 py-2 caps-micro text-gray-700">Tag</th>
                                        {SLOT_OPTIONS.map((slot) => {
                                            const slotTokens = slot === '2' ? secondPoolTokens : slot === '3' ? thirdPoolTokens : null;
                                            return (
                                                <th
                                                    key={slot}
                                                    className={`text-center px-2 py-2 caps-micro text-gray-700 ${slotTokens ? `${slotTokens.softBg} ${slotTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}` : ''}`}
                                                    style={slotTokens?.stripeCss}
                                                >
                                                    {slot}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tags.map((tag) => (
                                        <tr key={tag.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2">
                                                <div className="font-bold text-gray-800">{tag.name}</div>
                                                <div className="text-[11px] text-gray-400 font-mono">{tag.id}</div>
                                            </td>
                                            {SLOT_OPTIONS.map((slot) => {
                                                const checked = eligibilityMap[tag.id]?.has(slot) || false;
                                                return (
                                                    <td key={`${tag.id}-${slot}`} className="text-center px-2 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={!canMutate || savingConfig}
                                                            onChange={(e) => toggleEligibility(tag.id, slot, e.target.checked)}
                                                            className="h-4 w-4 rounded border-gray-300"
                                                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {advancedOpen && (
                        <div className="min-h-0 flex-1 ui-panel rounded-xl p-4 flex flex-col overflow-hidden">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-600" />
                                <h2 className="text-sm caps-title text-gray-900">Advanced Builder</h2>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Create non-matrix templates. Eligibility is managed from matrix above.</p>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    placeholder="template id (optional)"
                                    className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                    value={templateDraft.id || ''}
                                    onChange={(e) => setTemplateDraft({ ...templateDraft, id: e.target.value })}
                                />
                                <select
                                    className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                    value={templateDraft.type || 'count_limit'}
                                    onChange={(e) => setTemplateDraft({ ...templateDraft, type: e.target.value as WorkspaceRuleTemplate['type'] })}
                                >
                                    <option value="count_limit">Count limit</option>
                                    <option value="sequence_gap">Sequence gap</option>
                                    <option value="pairing">Pairing</option>
                                    <option value="single_shift_per_day">Single shift per day</option>
                                </select>
                            </div>

                            {templateDraft.type === 'count_limit' && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.tagId || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), tagId: e.target.value },
                                        })}
                                    >
                                        <option value="">Select tag</option>
                                        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.dayClass || 'all')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), dayClass: e.target.value },
                                        })}
                                    >
                                        {DAY_CLASS_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="max"
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.max ?? '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), max: Number(e.target.value || 0) },
                                        })}
                                    />
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.slot || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), slot: e.target.value || undefined },
                                        })}
                                    >
                                        <option value="">All slots</option>
                                        {SLOT_OPTIONS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                                    </select>
                                </div>
                            )}

                            {templateDraft.type === 'sequence_gap' && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.tagId || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), tagId: e.target.value },
                                        })}
                                    >
                                        <option value="">All tags</option>
                                        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.dayClass || 'all')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), dayClass: e.target.value },
                                        })}
                                    >
                                        {DAY_CLASS_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="min gap days"
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.minGapDays ?? 1)}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), minGapDays: Number(e.target.value || 0) },
                                        })}
                                    />
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.slot || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), slot: e.target.value || undefined },
                                        })}
                                    >
                                        <option value="">Any slot</option>
                                        {SLOT_OPTIONS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                                    </select>
                                </div>
                            )}

                            {templateDraft.type === 'pairing' && (
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.primaryTagId || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), primaryTagId: e.target.value },
                                        })}
                                    >
                                        <option value="">Primary tag</option>
                                        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.counterpartTagId || '')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), counterpartTagId: e.target.value },
                                        })}
                                    >
                                        <option value="">Counterpart tag</option>
                                        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <select
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={String((templateDraft.params as any)?.mode || 'must_pair_with')}
                                        onChange={(e) => setTemplateDraft({
                                            ...templateDraft,
                                            params: { ...(templateDraft.params || {}), mode: e.target.value },
                                        })}
                                    >
                                        <option value="must_pair_with">Must pair</option>
                                        <option value="cannot_pair_with">Cannot pair</option>
                                    </select>
                                </div>
                            )}

                            <div className="mt-2 flex items-center gap-3 text-xs">
                                <label className="inline-flex items-center gap-1.5 text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={templateDraft.hard !== false}
                                        onChange={(e) => setTemplateDraft({ ...templateDraft, hard: e.target.checked })}
                                    />
                                    Hard rule
                                </label>
                                <button
                                    onClick={saveTemplate}
                                    disabled={!canMutate || savingConfig}
                                    className="ui-btn ui-btn-accent px-3 py-1.5 rounded-lg text-xs caps-ui disabled:opacity-50"
                                >
                                    Save Template
                                </button>
                            </div>

                            <div className="mt-3 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                                {(schedulingConfig?.ruleTemplates || []).map((tpl) => (
                                    <div key={tpl.id} className="border border-gray-200 rounded-lg p-2 flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-bold text-gray-800">{tpl.id}</div>
                                            <div className="text-[11px] text-gray-500">{tpl.type} | {tpl.hard ? 'hard' : 'soft'} | {tpl.enabled ? 'enabled' : 'disabled'}</div>
                                        </div>
                                        <button
                                            onClick={() => removeTemplate(tpl.id)}
                                            disabled={!canMutate || savingConfig}
                                            className="p-1.5 text-gray-400 hover:text-rose-600 disabled:opacity-40"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <section className={`xl:col-span-5 min-h-0 flex flex-col gap-4 overflow-hidden ${isMobileV2 && !['cohorts', 'holidays'].includes(mobileTab) ? 'hidden md:flex' : ''}`}>
                    <div className="min-h-0 flex-1 ui-panel rounded-xl p-4 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-violet-600" />
                                <h2 className="text-sm caps-title text-gray-900">Fairness Cohorts</h2>
                            </div>
                            {isEditor && (
                                <button
                                    onClick={startNewCohort}
                                    disabled={!canMutate || savingConfig}
                                    className="ui-btn ui-btn-accent px-2.5 py-1.5 rounded-lg text-xs caps-ui disabled:opacity-50"
                                >
                                    <Plus className="w-3.5 h-3.5 inline mr-1" />New Cohort
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">ตั้งกติกากระจายเวรระดับกลุ่มให้ยุติธรรม: วันหยุดและวัน Noon ต้องต่างกันไม่เกิน 1</p>

                        <div className="mt-3 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                            {(schedulingConfig?.fairnessCohorts || []).length === 0 ? (
                                <div className="text-xs text-gray-400 text-center py-6">No cohorts configured</div>
                            ) : (schedulingConfig?.fairnessCohorts || []).map((cohort) => (
                                <div key={cohort.id} className="rounded-lg border border-violet-100 bg-violet-50 p-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-bold text-violet-900">{cohort.name}</div>
                                            <div className="text-[11px] text-violet-700 font-mono">{cohort.id}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => startEditCohort(cohort)}
                                                disabled={!canMutate || savingConfig}
                                            className="px-2 py-1 text-[11px] caps-ui rounded border border-violet-200 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                                            >Edit</button>
                                            <button
                                                onClick={() => removeCohort(cohort.id)}
                                                disabled={!canMutate || savingConfig}
                                                className="p-1.5 text-violet-400 hover:text-rose-600 disabled:opacity-40"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[11px] text-violet-800 space-y-0.5">
                                        <div>กลุ่มสมาชิก: {(cohort.memberTagIds || []).join(', ') || '-'}</div>
                                        <div>
                                            Holiday gap = {cohortLiveGaps[cohort.id]?.holidayGap ?? 0} {(cohortLiveGaps[cohort.id]?.holidayGap ?? 0) > 1 ? '(เกิน)' : '(ผ่าน)'}
                                            {' | '}
                                            Noon gap = {cohortLiveGaps[cohort.id]?.noonGap ?? 0} {(cohortLiveGaps[cohort.id]?.noonGap ?? 0) > 1 ? '(เกิน)' : '(ผ่าน)'}
                                        </div>
                                        {advancedOpen && (
                                            <div>slotScope: {(cohort.slotScope || []).join(', ') || '-'} | noonSlotScope: {(cohort.noonSlotScope || []).join(', ') || '-'}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {cohortDraft && (
                            <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                                <div className="text-xs caps-micro text-gray-700">
                                    {editingCohortId ? `Edit Cohort: ${editingCohortId}` : 'Create Cohort'}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="cohort id"
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={cohortDraft.id || ''}
                                        onChange={(e) => setCohortDraft({ ...cohortDraft, id: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="cohort name"
                                        className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                        value={cohortDraft.name || ''}
                                        onChange={(e) => setCohortDraft({ ...cohortDraft, name: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="member tags comma-separated"
                                        className="sm:col-span-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                                        value={(cohortDraft.memberTagIds || []).join(',')}
                                        onChange={(e) => setCohortDraft({
                                            ...cohortDraft,
                                            memberTagIds: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
                                        })}
                                    />
                                    {advancedOpen && (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="slot scope (e.g. 2,3)"
                                                className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                                value={(cohortDraft.slotScope || []).join(',')}
                                                onChange={(e) => setCohortDraft({
                                                    ...cohortDraft,
                                                    slotScope: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) as SlotOption[],
                                                })}
                                            />
                                            <input
                                                type="text"
                                                placeholder="noon slot scope (e.g. 2)"
                                                className="ui-input px-3 py-1.5 rounded-lg text-sm"
                                                value={(cohortDraft.noonSlotScope || []).join(',')}
                                                onChange={(e) => setCohortDraft({
                                                    ...cohortDraft,
                                                    noonSlotScope: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) as SlotOption[],
                                                })}
                                            />
                                        </>
                                    )}
                                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-700">
                                        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={cohortDraft.enforceTotal !== false} onChange={(e) => setCohortDraft({ ...cohortDraft, enforceTotal: e.target.checked })} />Total</label>
                                        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={cohortDraft.enforceHoliday !== false} onChange={(e) => setCohortDraft({ ...cohortDraft, enforceHoliday: e.target.checked })} />วันหยุด (ต่างไม่เกิน 1)</label>
                                        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={cohortDraft.enforceNoon !== false} onChange={(e) => setCohortDraft({ ...cohortDraft, enforceNoon: e.target.checked })} />วัน Noon (ต่างไม่เกิน 1)</label>
                                    </div>
                                    <div className="sm:col-span-2 text-[11px] text-violet-700">
                                        ระบบจะบังคับส่วนต่างสูงสุดของ Holiday/Noon เป็น 1 อัตโนมัติ
                                    </div>
                                </div>
                                {cohortError && <div className="text-xs text-rose-600">{cohortError}</div>}
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => {
                                            setCohortDraft(null);
                                            setEditingCohortId(null);
                                            setCohortError(null);
                                        }}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs caps-ui text-gray-600"
                                    >Cancel</button>
                                    <button
                                        onClick={saveCohort}
                                        disabled={!canMutate || savingConfig}
                                        className="ui-btn ui-btn-accent px-3 py-1.5 rounded-lg text-xs caps-ui disabled:opacity-50"
                                    >Save Cohort</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={`ui-panel rounded-xl p-4 flex flex-col max-h-[220px] md:max-h-[260px] ${isMobileV2 && mobileTab !== 'holidays' ? 'hidden md:flex' : ''}`}>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-amber-600" />
                            <h2 className="text-sm caps-title text-gray-900">Holidays</h2>
                            <span className="text-xs text-gray-400">({holidays.length})</span>
                        </div>
                        <div className="mt-2 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                            {holidays.map((holiday: Holiday) => (
                                <div key={holiday.date} className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-1.5">
                                    <div className="text-[11px] text-amber-700 font-mono">{holiday.date}</div>
                                    <div className="text-xs text-amber-900 truncate" title={holiday.name}>{holiday.name}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
