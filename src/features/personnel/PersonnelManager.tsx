import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { useUIStore } from '../../lib/store/useUIStore';
import { useConfigStore } from '../../lib/store/useConfigStore';
import { useCumulativeStore } from '../../lib/store/useCumulativeStore';
import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import type { Person } from '../../lib/shiftplan/types';
import {
    apiFetch,
    ensureApiSuccess,
    isPreviewReadonlyError,
    PREVIEW_READONLY_MESSAGE,
} from '../../lib/workspaceApi';
import type { MonthRoster, RosterTemplate } from '../../lib/roster';
import { buildMonthSummary, getPersonSummaryGroup, getSummaryGroupDefinitions } from '../../lib/roster';
import {
    Users, Plus, Trash2, Edit2, Check, X, Lock,
    ChevronDown, ChevronRight as ChevronR, UserPlus,
    ChevronLeft, Sparkles, Upload, AlertCircle, ArrowRightLeft, BarChart3, LineChart, Search, Filter, Calendar as CalendarIcon
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isWeekend, parseISO } from 'date-fns';
import {
    CALL_TAG_DISPLAY,
    CALL_TAG_IDS,
    getSubsetDisplay,
    getSubsetOptions,
    replaceSubsetTag,
} from '../shared/tagDisplay';
import { countRuleGroupTags, normalizePersonTags } from '../shared/personTagModel';
import {
    getCombinedSemanticTokens,
    getToneForTag,
    getToneSoftClass,
    getToneSolidClass,
} from '../shared/semanticColors';
import { GsapPresence } from '../../components/animations/GsapPresence';
import { buildPersonInsightMetrics } from '../../lib/insights/metrics';
import { buildForecastResults, buildPersonTimeline, buildSummaryHistory } from '../../lib/insights/forecast';
import { buildRebalanceSimulation } from '../../lib/insights/rebalance';
import type { SimulationPlan } from '../../lib/insights/types';
import { buildPriorityPack } from '../../lib/insights/priorityPack';
import SurfaceBadge from '../../components/ui/SurfaceBadge';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { featureFlags } from '../../config/flags';

const CALL_TAGS = CALL_TAG_IDS.map(id => ({
    id,
    label: CALL_TAG_DISPLAY[id].label,
    color: CALL_TAG_DISPLAY[id].softClass,
    solidColor: getToneSolidClass(getToneForTag(id)),
}));

const COLOR_PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#ec4899', '#64748b',
];

const emptyPerson = (): Partial<Person> => ({
    id: '', name: '', color: '#10b981', tagIds: [],
    unavailableDates: [], targetTotal: undefined,
    targetHoliday: undefined, targetWeekday: undefined,
});

const formatDayList = (dates: string[]) => {
    if (!dates || dates.length === 0) return '—';
    return dates
        .map(date => String(parseInt(date.slice(8, 10), 10)))
        .join(', ');
};

const withAlpha = (hex: string, alpha: number) => {
    if (!hex || !hex.startsWith('#')) return hex;
    const normalized = hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    if (normalized.length !== 7) return hex;
    const aa = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
    return `${normalized}${aa}`;
};

const previewNames = (names: string[], limit = 4) => {
    if (names.length <= limit) return names.join(', ');
    const shown = names.slice(0, limit).join(', ');
    return `${shown} +${names.length - limit}`;
};

const getHeatmapCellClass = (value: number) => {
    const abs = Math.abs(value);
    if (abs <= 0.15) return 'bg-emerald-100 text-emerald-800';
    if (abs <= 0.35) return 'bg-amber-100 text-amber-800';
    return 'bg-rose-100 text-rose-800';
};

type DeletePreviewShape = {
    person: Person;
    removedShiftCount: number;
    affectedMonths: string[];
    affectedByLevel: Record<'1A' | '1B' | '2' | '3', number>;
    affectedDatesSample: string[];
    warnings: string[];
};

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const getCurrentMonthKey = () => format(new Date(), 'yyyy-MM');
const normalizeMonthKey = (value: string | null | undefined) => (
    value && MONTH_KEY_REGEX.test(value) ? value : getCurrentMonthKey()
);

// Group people by their first matching subset
function groupPeople(people: Person[], subsetDefs: Array<{ id: string; name: string; color?: string }>) {
    const order = subsetDefs.map(s => s.id);
    const groups: Record<string, Person[]> = {};
    const ungrouped: Person[] = [];

    for (const p of people) {
        const subsetId = (p.tagIds || []).find(t => order.includes(t));
        if (subsetId) {
            if (!groups[subsetId]) groups[subsetId] = [];
            groups[subsetId].push(p);
        } else {
            ungrouped.push(p);
        }
    }

    const result: { label: string; color: string; members: Person[] }[] = [];
    for (const sub of subsetDefs) {
        if (groups[sub.id]?.length) {
            result.push({ label: sub.name, color: sub.color || '#e5e7eb', members: groups[sub.id] });
        }
    }
    if (ungrouped.length) {
        result.push({ label: 'Unassigned', color: '#e5e7eb', members: ungrouped });
    }
    return result;
}

type InsightPackNotice = { kind: 'ok' | 'warn' | 'error'; message: string } | null;

export default function PersonnelManager() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { setPeopleForMonth, shifts, peopleByMonth, setShifts, setInsightPriorityPack, insightPriorityPack } = useScheduleStore();
    const { isEditor, canMutate, isPreviewReadonly } = useUIStore();
    const { holidays, schedulingConfig, setSchedulingConfig, setTags } = useConfigStore();

    const [people, setPeople] = useState<Person[]>([]);
    const [editing, setEditing] = useState<Partial<Person> | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);

    // Mini calendar state for unavailable dates
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    // Smart import state
    const [showSmartImport, setShowSmartImport] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importPreview, setImportPreview] = useState<{ base64: string; mime: string; name: string } | null>(null);
    const [importResult, setImportResult] = useState<any[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Which person row is expanded in the sidebar
    const [expandedId, setExpandedId] = useState<string | null>(null);
    // Which group sections are collapsed
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'included' | 'excluded'>('all');
    const [deletePreview, setDeletePreview] = useState<DeletePreviewShape | null>(null);
    const [templates, setTemplates] = useState<RosterTemplate[]>([]);
    const [monthRoster, setMonthRoster] = useState<MonthRoster | null>(null);
    const [summarySort, setSummarySort] = useState<'risk' | 'name' | 'total'>('risk');
    const [personnelPanelMode, setPersonnelPanelMode] = useState<'roster' | 'edit'>('roster');
    const [previewNotice, setPreviewNotice] = useState<string | null>(null);
    const ruleGroupHygieneNoticeShownRef = useRef(false);
    const [subsetPickerFor, setSubsetPickerFor] = useState<string | null>(null);
    const [draggingPersonId, setDraggingPersonId] = useState<string | null>(null);
    const [dropBucket, setDropBucket] = useState<'included' | 'excluded' | null>(null);
    const [noonDays, setNoonDays] = useState<string[]>([]);
    const [showInsights, setShowInsights] = useState(false);
    const [heatmapScope, setHeatmapScope] = useState<'included' | 'all'>('included');
    const [simulationPlan, setSimulationPlan] = useState<SimulationPlan | null>(null);
    const [simulationSnapshot, setSimulationSnapshot] = useState<Record<string, 'include' | 'exclude'> | null>(null);
    const [timelinePersonId, setTimelinePersonId] = useState<string | null>(null);
    const [expandedRosterGroups, setExpandedRosterGroups] = useState<Set<string>>(new Set());
    const [insightPackNotice, setInsightPackNotice] = useState<InsightPackNotice>(null);
    const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
    const subsetOptions = useMemo(() => getSubsetOptions(schedulingConfig), [schedulingConfig]);
    const subsetColorById = useMemo(() => {
        const map = new Map<string, string>();
        DEFAULT_SUBSETS.forEach(subset => map.set(subset.id, subset.color || '#e5e7eb'));
        return map;
    }, []);
    const subsetDefs = useMemo(() => {
        const configured = (schedulingConfig?.subsets || [])
            .filter(s => s.active !== false)
            .map(s => ({ id: s.id, name: s.name, color: '#e5e7eb' }));
        return configured.length > 0 ? configured : DEFAULT_SUBSETS.map(s => ({ id: s.id, name: s.name, color: s.color }));
    }, [schedulingConfig]);

    const [monthKey, setMonthKey] = useState<string>(() => normalizeMonthKey(searchParams.get('month')));
    const [monthSelectorOpen, setMonthSelectorOpen] = useState(false);
    const pageGradient = getGradientRecipe('personnel', 'page-bg');
    const isMobileV2 = featureFlags.mobileV2;

    useEffect(() => {
        const queryMonth = searchParams.get('month');
        const normalizedMonth = normalizeMonthKey(queryMonth);
        setMonthKey(prev => (prev === normalizedMonth ? prev : normalizedMonth));
        if (queryMonth !== normalizedMonth) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('month', normalizedMonth);
            setSearchParams(nextParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        apiFetch('/api/state')
            .then(r => r.json())
            .then(data => {
                const loaded: Person[] = data.people || [];
                const normalizedLoaded: Person[] = loaded.map((person) => ({
                    ...person,
                    tagIds: normalizePersonTags(person.tagIds || [], data.schedulingConfig, { singleRuleGroup: true }),
                }));
                const hasLegacyRuleGroupData = loaded.some((person) => (
                    countRuleGroupTags(person.tagIds || [], data.schedulingConfig) > 1
                ));
                const scheduleState = useScheduleStore.getState();
                const cachedPeople = scheduleState.peopleByMonth['all'] || [];
                const cachedShifts = scheduleState.shifts || [];
                if (cachedPeople.length > 0) {
                    const normalizedCached = cachedPeople.map((person) => ({
                        ...person,
                        tagIds: normalizePersonTags(person.tagIds || [], data.schedulingConfig, { singleRuleGroup: true }),
                    }));
                    setPeople(normalizedCached);
                    setPeopleForMonth('all', normalizedCached);
                } else {
                    setPeople(normalizedLoaded);
                    setPeopleForMonth('all', normalizedLoaded);
                }
                if (cachedShifts.length === 0) {
                    setShifts(data.shifts || []);
                }
                setNoonDays(data.noonDays || []);
                if (data.schedulingConfig) {
                    setSchedulingConfig(data.schedulingConfig);
                    setTags((data.schedulingConfig.tags || []).map((t: any) => ({
                        id: t.id,
                        name: t.label,
                        color: t.color,
                    })));
                }
                if (hasLegacyRuleGroupData && !ruleGroupHygieneNoticeShownRef.current) {
                    ruleGroupHygieneNoticeShownRef.current = true;
                    setPreviewNotice('พบข้อมูลเก่าที่มีหลาย Rule Group Tag และระบบจัดให้อัตโนมัติแล้ว');
                    setTimeout(() => setPreviewNotice(null), 3000);
                    if (canMutate) {
                        apiFetch('/api/people', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(normalizedLoaded),
                        }).catch(console.error);
                    }
                }
            })
            .catch(console.error);

        apiFetch('/api/roster/templates')
            .then(r => r.json())
            .then(data => setTemplates(data.templates || []))
            .catch(console.error);
    }, [canMutate, setPeopleForMonth, setSchedulingConfig, setShifts, setTags]);

    useEffect(() => {
        apiFetch(`/api/roster/month/${monthKey}`)
            .then(r => r.json())
            .then(data => setMonthRoster(data.roster || null))
            .catch(console.error);
    }, [monthKey]);

    const handleMonthChange = (nextMonth: string) => {
        const normalizedMonth = normalizeMonthKey(nextMonth);
        setMonthKey(normalizedMonth);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('month', normalizedMonth);
        setSearchParams(nextParams, { replace: true });
    };

    const showPreviewNotice = () => {
        setPreviewNotice(PREVIEW_READONLY_MESSAGE);
        setTimeout(() => setPreviewNotice(null), 3000);
    };

    const showInsightNotice = (kind: 'ok' | 'warn' | 'error', message: string) => {
        setInsightPackNotice({ kind, message });
        setTimeout(() => setInsightPackNotice(null), 3600);
    };

    const handleMutationError = (err: unknown, fallback = 'Failed to save changes') => {
        if (isPreviewReadonlyError(err)) {
            showPreviewNotice();
            return;
        }
        console.error(err);
        setImportError(fallback);
    };

    const enterRosterMode = () => {
        setPersonnelPanelMode('roster');
        setEditing(null);
        setIsNew(false);
        setSubsetPickerFor(null);
    };

    const enterEditMode = () => {
        setPersonnelPanelMode('edit');
    };

    const saveToDB = async (updated: Person[]) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        // Optimistic update — list reflects change immediately
        setPeople(updated);
        setPeopleForMonth('all', updated);
        setSaving(true);
        try {
            const res = await apiFetch('/api/people', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
            await ensureApiSuccess(res);
            setImportError(null);
        } catch (err) {
            handleMutationError(err, 'Failed to save people');
        } finally {
            setSaving(false);
        }
    };

    const startAdd = () => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        setEditing(emptyPerson());
        setCalendarMonth(new Date());
        setIsNew(true);
        setExpandedId(null);
        enterEditMode();
        setMobileView('detail');
    };

    const startEdit = (person: Person) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        setEditing({ ...person });
        // Set calendar to month of first unavailable date, or current month
        const first = (person.unavailableDates || [])[0];
        setCalendarMonth(first ? parseISO(first) : new Date());
        setIsNew(false);
        enterEditMode();
        setMobileView('detail');
    };

    const cancelEdit = () => {
        enterRosterMode();
        setMobileView('list');
    };

    const toggleTag = (tagId: string) => {
        if (!editing) return;
        const tags = editing.tagIds || [];
        setEditing({
            ...editing,
            tagIds: tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId],
        });
    };

    const selectRuleGroupTag = (tagId: string) => {
        if (!editing) return;
        setEditing({
            ...editing,
            tagIds: replaceSubsetTag(editing.tagIds || [], tagId, schedulingConfig),
        });
    };

    const toggleUnavailDate = (dateStr: string) => {
        if (!editing) return;
        const dates = editing.unavailableDates || [];
        setEditing({
            ...editing,
            unavailableDates: dates.includes(dateStr)
                ? dates.filter(d => d !== dateStr)
                : [...dates, dateStr].sort(),
        });
    };

    const savePerson = async () => {
        if (!editing?.name?.trim()) return;

        const person: Person = {
            id: editing.id || Math.random().toString(36).slice(2, 10),
            name: editing.name.trim(),
            color: editing.color || '#10b981',
            tagIds: normalizePersonTags(editing.tagIds || [], schedulingConfig, { singleRuleGroup: true }),
            unavailableDates: editing.unavailableDates || [],
            targetTotal: editing.targetTotal,
            targetHoliday: editing.targetHoliday,
            targetWeekday: editing.targetWeekday,
        };

        const updated = isNew
            ? [...people, person]
            : people.map(p => p.id === person.id ? person : p);

        await saveToDB(updated);
        enterRosterMode();
        setExpandedId(person.id);
        setMobileView('list');
    };

    // Smart Import handlers
    const handleFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const [header, base64] = dataUrl.split(',');
            const mime = header.replace('data:', '').replace(';base64', '');
            setImportPreview({ base64, mime, name: file.name });
            setImportResult(null);
            setImportError(null);
        };
        reader.readAsDataURL(file);
    };

    const runSmartImport = async () => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        if (!importPreview) return;
        setImportLoading(true);
        setImportError(null);
        try {
            const res = await apiFetch('/api/smart-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64Data: importPreview.base64,
                    mimeType: importPreview.mime,
                    currentDateStr: format(new Date(), 'yyyy-MM'),
                    people: people.map(p => ({ id: p.id, name: p.name })),
                }),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            setImportResult(data.shifts || []);
        } catch (err) {
            handleMutationError(err, 'Import failed');
        } finally {
            setImportLoading(false);
        }
    };

    const applyImportedShifts = async () => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        if (!importResult) return;
        try {
            const res = await apiFetch('/api/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importResult),
            });
            await ensureApiSuccess(res);
            setShowSmartImport(false);
            setImportPreview(null);
            setImportResult(null);
            setImportError(null);
        } catch (err) {
            handleMutationError(err, 'Failed to apply imported shifts');
        }
    };

    const deletePerson = (id: string) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        const person = people.find(p => p.id === id);
        if (!person) return;
        apiFetch(`/api/people/${id}?preview=1&monthKey=${monthKey}`, { method: 'DELETE' })
            .then(async (res) => {
                await ensureApiSuccess(res);
                const data = await res.json();
                setDeletePreview({
                    person,
                    removedShiftCount: data.preview?.removedShiftCount || 0,
                    affectedMonths: data.preview?.affectedMonths || [],
                    affectedByLevel: data.preview?.affectedByLevel || { '1A': 0, '1B': 0, '2': 0, '3': 0 },
                    affectedDatesSample: data.preview?.affectedDatesSample || [],
                    warnings: data.preview?.warnings || [],
                });
            })
            .catch((err) => handleMutationError(err, 'Failed to preview delete'));
    };

    const confirmDelete = async () => {
        if (!deletePreview) return;
        if (editing?.id === deletePreview.person.id) cancelEdit();
        setExpandedId(null);
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        try {
            const res = await apiFetch(`/api/people/${deletePreview.person.id}?monthKey=${monthKey}`, { method: 'DELETE' });
            await ensureApiSuccess(res);
            const data = await res.json();
            const nextPeople: Person[] = data.people || people.filter(p => p.id !== deletePreview.person.id);
            setPeople(nextPeople);
            setPeopleForMonth('all', nextPeople);
            if (Array.isArray(data.shifts)) {
                setShifts(data.shifts);
            }
        } catch (err) {
            handleMutationError(err, 'Failed to delete person');
            return;
        }
        setDeletePreview(null);
    };

    const toggleGroup = (label: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
        });
    };

    const effectiveIncludedSet = useMemo(
        () => new Set(monthRoster?.includedPersonIds || people.map(p => p.id)),
        [monthRoster, people],
    );
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const filteredPeople = useMemo(() => {
        return people.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(deferredSearchQuery.toLowerCase());
            if (!matchesSearch) return false;

            if (activeFilter === 'included') return effectiveIncludedSet.has(p.id);
            if (activeFilter === 'excluded') return !effectiveIncludedSet.has(p.id);
            return true;
        });
    }, [people, deferredSearchQuery, activeFilter, effectiveIncludedSet]);

    const groups = useMemo(() => groupPeople(filteredPeople, subsetDefs), [filteredPeople, subsetDefs]);
    const summary = buildMonthSummary(peopleByMonth['all'] || [], shifts, monthKey, holidays.map(h => h.date), noonDays);
    const summaryGroups = useMemo(() => getSummaryGroupDefinitions(DEFAULT_SUBSETS), []);
    const rosterRows = useMemo(() => {
        const rows = people.map(person => {
            const personSummary = summary[person.id] || {
                total: 0,
                weekday: 0,
                holiday: 0,
                consecutivePairs: 0,
                everyOtherDayPairs: 0,
                firstCount: 0,
                secondCount: 0,
                thirdCount: 0,
                firstDates: [],
                secondDates: [],
                thirdDates: [],
                noonCount: 0,
                noonDates: [],
            };
            const riskScore = (personSummary.consecutivePairs * 2) + personSummary.everyOtherDayPairs;
            const summaryGroup = getPersonSummaryGroup(person, DEFAULT_SUBSETS);
            const rawSubset = getSubsetDisplay(person.tagIds || [], schedulingConfig);
            const subset = rawSubset
                ? {
                    ...rawSubset,
                    color: (rawSubset.color && rawSubset.color !== '#e5e7eb')
                        ? rawSubset.color
                        : (subsetColorById.get(rawSubset.id) || '#e5e7eb'),
                }
                : null;
            const callTagIds = (person.tagIds || []).filter(tagId => CALL_TAG_IDS.includes(tagId as any));
            const callLabel = callTagIds.length > 0
                ? callTagIds.map(tagId => CALL_TAG_DISPLAY[tagId as 'first_call' | 'second_call' | 'third_call'].label).join(' + ')
                : 'No Call Tag';
            const isIncluded = effectiveIncludedSet.has(person.id);
            let diagnosisText = 'ความเสี่ยงต่ำ: ภาระงานเดือนนี้ค่อนข้างสมดุล';
            let nextActionText = isIncluded
                ? 'แนวทาง: คง Included ไว้ แล้วตรวจอีกครั้งหลัง generate รอบถัดไป'
                : 'แนวทาง: คง Excluded ไว้สำหรับเดือนนี้';
            if (personSummary.consecutivePairs > 0 || personSummary.everyOtherDayPairs > 0) {
                diagnosisText = `ต้องระวัง: มีเวรติดกัน ${personSummary.consecutivePairs} ครั้ง และเวรวันเว้นวัน ${personSummary.everyOtherDayPairs} ครั้ง`;
                nextActionText = isIncluded
                    ? 'แนวทาง: เว้นช่วงเวรในสัปดาห์ถัดไปเพื่อลดเวรติดกัน'
                    : 'แนวทาง: เปิด Included เฉพาะช่วงที่คนไม่พอจริงๆ';
            }
            if (riskScore >= 4) {
                nextActionText = isIncluded
                    ? 'แนวทาง: พัก 1-2 วันก่อนจัดเวรใหม่'
                    : 'แนวทาง: คง Excluded ชั่วคราวจนความเสี่ยงลดลง';
            }
            return {
                person,
                personSummary,
                riskScore,
                summaryGroupId: summaryGroup.id,
                summaryGroupLabel: summaryGroup.label,
                summaryGroupOrder: summaryGroup.order,
                subset,
                callLabel,
                isMultiCall: callTagIds.length > 1,
                isIncluded,
                diagnosisText,
                nextActionText,
            };
        });

        rows.sort((a, b) => {
            if (summarySort === 'name') return a.person.name.localeCompare(b.person.name);
            if (summarySort === 'total') return b.personSummary.total - a.personSummary.total;
            if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
            if (a.summaryGroupOrder !== b.summaryGroupOrder) return a.summaryGroupOrder - b.summaryGroupOrder;
            return a.person.name.localeCompare(b.person.name);
        });
        return rows;
    }, [people, summary, summarySort, effectiveIncludedSet, schedulingConfig, subsetColorById]);
    const includedRosterRows = useMemo(
        () => rosterRows.filter(row => row.isIncluded),
        [rosterRows],
    );
    const excludedRosterRows = useMemo(
        () => rosterRows.filter(row => !row.isIncluded),
        [rosterRows],
    );
    const groupedIncludedRows = useMemo(() => {
        const map = new Map<string, typeof includedRosterRows>();
        for (const row of includedRosterRows) {
            if (!map.has(row.summaryGroupId)) map.set(row.summaryGroupId, []);
            map.get(row.summaryGroupId)!.push(row);
        }
        const ordered = summaryGroups
            .filter(group => map.has(group.id))
            .map(group => {
                const rows = map.get(group.id)!;
                const firstColor = rows.find(row => row.subset?.color)?.subset?.color || '#e5e7eb';
                return {
                    key: group.id,
                    label: group.label,
                    order: group.order,
                    color: firstColor,
                    rows,
                    namesPreview: previewNames(rows.map(row => row.person.name)),
                };
            });
        const leftovers = Array.from(map.entries())
            .filter(([key]) => !summaryGroups.some(group => group.id === key))
            .map(([key, rows]) => ({
                key,
                label: rows[0]?.summaryGroupLabel || key,
                order: 9_999,
                color: rows.find(row => row.subset?.color)?.subset?.color || '#e5e7eb',
                rows,
                namesPreview: previewNames(rows.map(row => row.person.name)),
            }));
        return [...ordered, ...leftovers];
    }, [includedRosterRows, summaryGroups]);
    const groupedExcludedRows = useMemo(() => {
        const map = new Map<string, typeof excludedRosterRows>();
        for (const row of excludedRosterRows) {
            if (!map.has(row.summaryGroupId)) map.set(row.summaryGroupId, []);
            map.get(row.summaryGroupId)!.push(row);
        }
        const ordered = summaryGroups
            .filter(group => map.has(group.id))
            .map(group => {
                const rows = map.get(group.id)!;
                const firstColor = rows.find(row => row.subset?.color)?.subset?.color || '#e5e7eb';
                return {
                    key: group.id,
                    label: group.label,
                    order: group.order,
                    color: firstColor,
                    rows,
                    namesPreview: previewNames(rows.map(row => row.person.name)),
                };
            });
        const leftovers = Array.from(map.entries())
            .filter(([key]) => !summaryGroups.some(group => group.id === key))
            .map(([key, rows]) => ({
                key,
                label: rows[0]?.summaryGroupLabel || key,
                order: 9_999,
                color: rows.find(row => row.subset?.color)?.subset?.color || '#e5e7eb',
                rows,
                namesPreview: previewNames(rows.map(row => row.person.name)),
            }));
        return [...ordered, ...leftovers];
    }, [excludedRosterRows, summaryGroups]);

    const toggleRosterGroup = (groupKey: string) => {
        setExpandedRosterGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };
    const insightMetrics = useMemo(
        () => buildPersonInsightMetrics(people, summary, effectiveIncludedSet),
        [people, summary, effectiveIncludedSet],
    );
    const metricsById = useMemo(
        () => new Map(insightMetrics.map(metric => [metric.personId, metric])),
        [insightMetrics],
    );
    const summaryHistory = useMemo(
        () => buildSummaryHistory(people, shifts, holidays.map(h => h.date), noonDays, 6),
        [people, shifts, holidays, noonDays],
    );
    const forecastResults = useMemo(
        () => buildForecastResults(people, effectiveIncludedSet, summaryHistory),
        [people, effectiveIncludedSet, summaryHistory],
    );
    const filteredMetrics = useMemo(
        () => (heatmapScope === 'included' ? insightMetrics.filter(metric => metric.included) : insightMetrics),
        [insightMetrics, heatmapScope],
    );
    const highRiskIncludedCount = useMemo(
        () => insightMetrics.filter(metric => metric.included && metric.riskAlerts.some(alert => alert.severity === 'high')).length,
        [insightMetrics],
    );
    const likelyOverloadCount = useMemo(
        () => forecastResults.filter(row => row.included && row.status === 'likely_overload').length,
        [forecastResults],
    );
    const likelyUnderloadCount = useMemo(
        () => forecastResults.filter(row => row.included && row.status === 'likely_underload').length,
        [forecastResults],
    );
    const attentionNowRows = useMemo(
        () => [...includedRosterRows]
            .sort((a, b) => {
                if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
                return b.personSummary.total - a.personSummary.total;
            })
            .slice(0, 3),
        [includedRosterRows],
    );
    const selectedTimeline = useMemo(
        () => (timelinePersonId ? buildPersonTimeline(timelinePersonId, summaryHistory) : []),
        [timelinePersonId, summaryHistory],
    );

    const currentTemplateId = monthRoster?.templateId || templates.find(t => t.isDefault)?.id || templates[0]?.id || '';
    const activePriorityPack = useMemo(
        () => (insightPriorityPack?.monthKey === monthKey ? insightPriorityPack : null),
        [insightPriorityPack, monthKey],
    );

    const handleApplyPriorityPack = async () => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        const cumulativeState = useCumulativeStore.getState();
        if (!cumulativeState.loaded) {
            const cumulativeRes = await apiFetch('/api/cumulative');
            if (cumulativeRes.ok) {
                const cumulativePayload = await cumulativeRes.json();
                cumulativeState.setData(cumulativePayload.data || {});
            }
        }
        const latestCumulativeState = useCumulativeStore.getState();
        if (Object.keys(latestCumulativeState.data).length === 0) {
            showInsightNotice('warn', 'ยังไม่มีข้อมูลสะสมพอสำหรับสร้าง Priority Pack');
            return;
        }

        const cumulativeTotals: Record<string, number> = {};
        for (const person of people) {
            cumulativeTotals[person.id] = latestCumulativeState.getTotalForPerson(person.id).total;
        }
        const pack = buildPriorityPack({
            monthKey,
            people,
            includedSet: effectiveIncludedSet,
            cumulativeTotals,
            schedulingConfig,
        });
        if (pack.eligibleCount === 0) {
            showInsightNotice('warn', 'ไม่พบคนที่มีสิทธิ์ 2nd/3rd call ในเดือนนี้');
            return;
        }
        setInsightPriorityPack(pack);

        const bandValues = Object.values(pack.bandByPersonId);
        const belowCount = bandValues.filter((band) => band === 'below_peers').length;
        const aboveCount = bandValues.filter((band) => band === 'above_peers').length;
        showInsightNotice(
            'ok',
            `Apply Priority Pack แล้ว: อยู่น้อยกว่าคนอื่น ${belowCount} คน · อยู่เยอะกว่าคนอื่น ${aboveCount} คน`,
        );
    };

    const saveRoster = async (payload: { templateId?: string; overrides?: Record<string, 'include' | 'exclude'> }) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        try {
            const res = await apiFetch(`/api/roster/month/${monthKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            setMonthRoster(data.roster);
        } catch (err) {
            handleMutationError(err, 'Failed to save roster');
        }
    };

    const runRebalanceSimulation = () => {
        setSimulationPlan(buildRebalanceSimulation(insightMetrics, 2));
    };

    const applySimulation = async () => {
        if (!simulationPlan || !canMutate) return;
        const currentOverrides = { ...(monthRoster?.overrides || {}) } as Record<string, 'include' | 'exclude'>;
        setSimulationSnapshot(currentOverrides);
        for (const personId of simulationPlan.suggestedExcludeIds) currentOverrides[personId] = 'exclude';
        for (const personId of simulationPlan.suggestedIncludeIds) currentOverrides[personId] = 'include';
        await saveRoster({ templateId: currentTemplateId, overrides: currentOverrides });
    };

    const rollbackSimulation = async () => {
        if (!simulationSnapshot || !canMutate) return;
        await saveRoster({ templateId: currentTemplateId, overrides: simulationSnapshot });
        setSimulationSnapshot(null);
    };

    const setEligibility = async (personId: string, mode: 'include' | 'exclude' | 'template') => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        try {
            const res = await apiFetch(`/api/people/${personId}/month/${monthKey}/eligibility`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            if (data.roster) {
                setMonthRoster(data.roster);
            } else {
                const rosterRes = await apiFetch(`/api/roster/month/${monthKey}`);
                if (rosterRes.ok) {
                    const rosterData = await rosterRes.json();
                    setMonthRoster(rosterData.roster || null);
                }
            }
            if (mode === 'exclude') {
                const stateRes = await apiFetch('/api/state');
                if (stateRes.ok) {
                    const st = await stateRes.json();
                    setShifts(st.shifts || []);
                }
            }
        } catch (err) {
            handleMutationError(err, 'Failed to update eligibility');
        }
    };
    const toggleIncluded = async (personId: string, currentlyIncluded: boolean) => {
        await setEligibility(personId, currentlyIncluded ? 'exclude' : 'include');
    };

    const savePersonTags = async (personId: string, tagIds: string[]) => {
        if (!canMutate) {
            showPreviewNotice();
            return;
        }
        try {
            const res = await apiFetch(`/api/people/${personId}/tags`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagIds }),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            const nextPeople = data.people || [];
            setPeople(nextPeople);
            setPeopleForMonth('all', nextPeople);
        } catch (err) {
            handleMutationError(err, 'Failed to update tags');
        }
    };

    const updateSubsetTag = async (person: Person, nextSubsetId: string | null) => {
        const nextTagIds = replaceSubsetTag(person.tagIds || [], nextSubsetId, schedulingConfig);
        await savePersonTags(person.id, nextTagIds);
        setSubsetPickerFor(null);
    };

    const onDragStartPerson = (personId: string, e: React.DragEvent) => {
        setDraggingPersonId(personId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', personId);
    };

    const onDropToBucket = async (bucket: 'included' | 'excluded', e: React.DragEvent) => {
        e.preventDefault();
        const personId = e.dataTransfer.getData('text/plain') || draggingPersonId;
        setDropBucket(null);
        setDraggingPersonId(null);
        if (!personId) return;
        const currentlyIncluded = effectiveIncludedSet.has(personId);
        if ((bucket === 'included' && currentlyIncluded) || (bucket === 'excluded' && !currentlyIncluded)) return;
        await setEligibility(personId, bucket === 'included' ? 'include' : 'exclude');
    };

    return (
        <div className="ui-page-root flex flex-col h-full overflow-hidden" style={{ background: pageGradient.background }}>
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

            {/* ── Mobile tab bar ──────────────────────────────────────────── */}
            <div className="md:hidden shrink-0 flex border-b border-gray-200 bg-white">
                <button
                    onClick={() => setMobileView('list')}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${mobileView === 'list' ? 'text-emerald-600' : 'text-gray-400'}`}
                >
                    <Users className="w-4 h-4" />
                    People
                </button>
                <button
                    onClick={() => { enterRosterMode(); setMobileView('detail'); }}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${mobileView === 'detail' ? 'text-emerald-600' : 'text-gray-400'}`}
                >
                    <BarChart3 className="w-4 h-4" />
                    Roster
                </button>
            </div>

            {/* ── Content row ─────────────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">

            {/* ── Left sidebar: person list ───────────────────────────────── */}
            <aside className={`flex-col ui-panel rounded-none border-r overflow-hidden md:w-72 md:shrink-0 ${mobileView === 'list' ? 'flex w-full' : 'hidden'} md:flex`}>

                {/* Sidebar header */}
                <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 ui-page-header">
                    <div>
                        <h1 className="caps-title text-gray-900 flex items-center gap-2 text-sm">
                            <Users className="w-4 h-4 text-emerald-600" />
                            Personnel
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">{people.length} member{people.length !== 1 ? 's' : ''}</p>
                    </div>
                    {isEditor ? (
                        <button
                            onClick={startAdd}
                            disabled={!canMutate}
                            title="Add member"
                            className="ui-btn ui-btn-accent w-8 h-8 flex items-center justify-center rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    ) : (
                        <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] caps-micro border border-amber-200">
                            <Lock className="w-2.5 h-2.5" /> Guest
                        </span>
                    )}
                </div>

                {/* Search & Filter */}
                <div className="px-4 py-3 border-b border-gray-100 ui-page-header space-y-3 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="ui-input w-full pl-9 pr-8 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="ui-panel-subtle flex p-0.5 rounded-lg">
                        {(['all', 'included', 'excluded'] as const).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`flex-1 py-1.5 px-2 text-[10px] caps-ui rounded-md transition-colors ${activeFilter === filter ? 'ui-panel-raised text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grouped person list */}
                <div className="flex-1 overflow-y-auto">
                    {people.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                            <UserPlus className="w-10 h-10 text-gray-200" />
                            <p className="text-sm text-gray-400 font-medium">No team members yet</p>
                            {isEditor && (
                                <button
                                    onClick={startAdd}
                                    disabled={!canMutate}
                                    className="text-xs text-emerald-600 font-bold hover:underline disabled:opacity-40 disabled:no-underline"
                                >
                                    Add the first member →
                                </button>
                            )}
                        </div>
                    ) : (
                        groups.map(group => {
                            const isCollapsed = collapsedGroups.has(group.label);
                            const groupSubset = subsetDefs.find((subset) => subset.name === group.label);
                            const groupTokens = getCombinedSemanticTokens({
                                tagIds: groupSubset ? [groupSubset.id] : [],
                                subsetId: groupSubset?.id || null,
                            });
                            return (
                                <div key={group.label}>
                                    {/* Group header */}
                                    <button
                                        onClick={() => toggleGroup(group.label)}
                                        className={`w-full flex items-center gap-2 px-4 py-2 transition-colors border-b border-gray-100 hover:opacity-85 ${groupTokens.softBg} ${groupTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}`}
                                        style={groupTokens.stripeCss}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: group.color }}
                                        />
                                        <span className="flex-1 text-left text-[11px] caps-micro text-gray-500">
                                            {group.label}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 mr-1">
                                            {group.members.length}
                                        </span>
                                        {isCollapsed
                                            ? <ChevronR className="w-3 h-3 text-gray-400" />
                                            : <ChevronDown className="w-3 h-3 text-gray-400" />
                                        }
                                    </button>

                                    {/* Group members */}
                                    {!isCollapsed && group.members.map(person => {
                                        const isExpanded = expandedId === person.id;
                                        const isActiveEdit = editing?.id === person.id && !isNew;
                                        const callTags = (person.tagIds || []).filter(t => CALL_TAGS.find(c => c.id === t));
                                        const subsetTags = (person.tagIds || []).filter(t => DEFAULT_SUBSETS.find(s => s.id === t));

                                        return (
                                            <div key={person.id}>
                                                {/* Collapsed row */}
                                                <button
                                                    onClick={() => setExpandedId(isExpanded ? null : person.id)}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-gray-50
                                                        ${isActiveEdit ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-gray-50'}`}
                                                >
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                                                        style={{ backgroundColor: person.color || '#10b981' }}
                                                    >
                                                        {person.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-bold truncate ${isActiveEdit ? 'text-emerald-700' : 'text-gray-900'}`}>
                                                            {person.name}
                                                        </p>
                                                        {(person.unavailableDates?.length || 0) > 0 && (
                                                            <p className="text-[10px] text-rose-500 font-bold truncate mt-0.5" title="Unavailable Dates">
                                                                Off: {(person.unavailableDates || [])
                                                                    .filter((d): d is string => typeof d === 'string')
                                                                    .map((d) => Number.parseInt(d.split('-')[2] || '', 10))
                                                                    .filter((day) => Number.isFinite(day))
                                                                    .join(', ')}
                                                            </p>
                                                        )}
                                                        {!isExpanded && callTags.length > 0 && (
                                                            <p className="text-[10px] text-gray-400 truncate">
                                                                {callTags.map(t => CALL_TAGS.find(c => c.id === t)?.label).join(' · ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <ChevronDown className={`w-3.5 h-3.5 text-gray-300 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                </button>

                                                {/* Expanded details */}
                                                {isExpanded && (
                                                    <div className="px-4 pb-3 bg-gray-50/80 border-b border-gray-100">
                                                        {/* Call tags */}
                                                        {callTags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 pt-2 pb-1">
                                                                {callTags.map(t => {
                                                                    const ct = CALL_TAGS.find(c => c.id === t)!;
                                                                    return (
                                                                        <SurfaceBadge key={t} tagIds={[t]} miniLegend className="border">
                                                                            {ct.label}
                                                                        </SurfaceBadge>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {/* Rule group tags */}
                                                        {subsetTags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 pt-1 pb-1">
                                                                {subsetTags.map(t => {
                                                                    const sub = DEFAULT_SUBSETS.find(s => s.id === t)!;
                                                                    const subTokens = getCombinedSemanticTokens({ tagIds: [sub.id], subsetId: sub.id });
                                                                    return (
                                                                        <span
                                                                            key={t}
                                                                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${subTokens.softBg} ${subTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}`}
                                                                            style={subTokens.stripeCss}
                                                                        >
                                                                            {sub.name}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {(person.tagIds || []).length === 0 && (
                                                            <p className="text-[10px] text-gray-400 italic pt-2">No tags assigned</p>
                                                        )}
                                                        {/* Action buttons */}
                                                        {isEditor && (
                                                            <div className="flex gap-2 pt-2.5">
                                                                <button
                                                                    onClick={() => { startEdit(person); setExpandedId(null); }}
                                                                    disabled={!canMutate}
                                                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] caps-ui bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-emerald-400 hover:text-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    <Edit2 className="w-3 h-3" /> Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => deletePerson(person.id)}
                                                                    disabled={!canMutate}
                                                                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] caps-ui bg-white border border-gray-200 text-gray-400 rounded-lg hover:border-rose-300 hover:text-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })
                    )}
                </div>
            </aside>

            {/* ── Right: edit form or welcome state ──────────────────────── */}
            <div className={`flex-col overflow-hidden md:flex md:flex-1 ${mobileView === 'detail' ? 'flex flex-1' : 'hidden'}`}>
                <div className="ui-page-header px-4 sm:px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] caps-micro text-gray-500">Monthly Roster</p>
                            <p className="text-xs text-gray-400">{monthKey} · Included {monthRoster?.includedPersonIds?.length || 0} / {people.length}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative group">
                                <button
                                    onClick={() => setMonthSelectorOpen(!monthSelectorOpen)}
                                    className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl transition-colors min-w-[140px] justify-between"
                                    title="Select month for this roster"
                                >
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon className="w-4 h-4" />
                                        <span className="text-xs font-bold whitespace-nowrap">
                                            {monthKey ? format(parseISO(`${monthKey}-01`), 'MMM yyyy') : 'Select Month'}
                                        </span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 opacity-50 transition-transform ${monthSelectorOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {monthSelectorOpen && (
                                    <div className="absolute top-full left-0 mt-2 p-3 bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl z-50 min-w-[260px] animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <button
                                                onClick={() => {
                                                    const currentYear = monthKey ? parseInt(monthKey.split('-')[0]) : new Date().getFullYear();
                                                    handleMonthChange(`${currentYear - 1}-${monthKey ? monthKey.split('-')[1] : '01'}`);
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <span className="text-sm font-bold text-gray-800">
                                                {monthKey ? monthKey.split('-')[0] : new Date().getFullYear()}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const currentYear = monthKey ? parseInt(monthKey.split('-')[0]) : new Date().getFullYear();
                                                    handleMonthChange(`${currentYear + 1}-${monthKey ? monthKey.split('-')[1] : '01'}`);
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                                            >
                                                <ChevronR className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {Array.from({ length: 12 }, (_, i) => {
                                                const monthStr = (i + 1).toString().padStart(2, '0');
                                                const year = monthKey ? monthKey.split('-')[0] : new Date().getFullYear().toString();
                                                const value = `${year}-${monthStr}`;
                                                const isSelected = monthKey === value;
                                                const mName = format(parseISO(`${year}-${monthStr}-01`), 'MMM');

                                                return (
                                                    <button
                                                        key={value}
                                                        onClick={() => {
                                                            handleMonthChange(value);
                                                            setMonthSelectorOpen(false);
                                                        }}
                                                        className={`py-2 text-xs font-semibold rounded-xl transition-all ${isSelected
                                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-105 z-10'
                                                            : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                                                            }`}
                                                    >
                                                        {mName}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <select
                                value={currentTemplateId}
                                disabled={!canMutate}
                                onChange={e => saveRoster({ templateId: e.target.value })}
                                className="px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                            >
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400 caps-micro">Panel</span>
                            <button
                                onClick={enterRosterMode}
                                className={`ui-btn px-2 py-1 text-[10px] caps-ui ${personnelPanelMode === 'roster' ? 'ui-btn-accent shadow-sm' : 'ui-btn-neutral'}`}
                            >
                                Manage Roster
                            </button>
                            <button
                                onClick={enterEditMode}
                                className={`ui-btn px-2 py-1 text-[10px] caps-ui ${personnelPanelMode === 'edit' ? 'ui-btn-accent shadow-sm' : 'ui-btn-neutral'}`}
                            >
                                Edit Personnel
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5" hidden={personnelPanelMode !== 'roster'}>
                            <span className="text-[10px] text-gray-400 caps-micro">Sort</span>
                            {([
                                ['risk', 'Risk'],
                                ['name', 'Name'],
                                ['total', 'Total'],
                            ] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setSummarySort(key)}
                                    className={`ui-btn px-2 py-1 text-[10px] caps-ui ${summarySort === key ? 'ui-btn-accent shadow-sm' : 'ui-btn-neutral'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {personnelPanelMode === 'edit' ? (editing ? (
                    <>
                        {/* Form header */}
                        <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="caps-title text-gray-900">{isNew ? 'New Member' : `Edit — ${editing.name || '…'}`}</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Fill in details then save.</p>
                            </div>
                            <button
                                onClick={cancelEdit}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form body */}
                        <div className="flex-1 overflow-auto p-6 space-y-6">

                            {/* Name + color row */}
                            <div className="flex gap-4 items-start">
                                {/* Avatar preview */}
                                <div
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md"
                                    style={{ backgroundColor: editing.color || '#10b981' }}
                                >
                                    {(editing.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Full Name</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Dr. Smith…"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        value={editing.name || ''}
                                        onChange={e => setEditing({ ...editing, name: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Color picker */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Colour</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_PALETTE.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setEditing({ ...editing, color: c })}
                                            className={`w-8 h-8 rounded-full transition-transform ${editing.color === c ? 'ring-2 ring-offset-2 ring-gray-700 scale-110' : 'hover:scale-105'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Divider */}
                            <hr className="border-gray-100" />

                            {/* Call eligibility */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Call Eligibility</label>
                                <p className="text-xs text-gray-400 mb-3">Call Tag: เวรที่ลงได้ (1st/2nd/3rd)</p>
                                <div className="flex gap-2 flex-wrap">
                                    {CALL_TAGS.map(tag => {
                                        const selected = (editing.tagIds || []).includes(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => toggleTag(tag.id)}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all
                                                    ${selected ? `${tag.solidColor} shadow-md` : `${tag.color} hover:opacity-80`}`}
                                            >
                                                {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Rule Group Tag */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Rule Group Tag</label>
                                <p className="text-xs text-gray-400 mb-3">กลุ่มกติกา solver/โควตา (เลือกได้ 1 กลุ่มต่อคน)</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {DEFAULT_SUBSETS.map(sub => {
                                        const selected = (editing.tagIds || []).includes(sub.id);
                                        const subTokens = getCombinedSemanticTokens({ tagIds: [sub.id], subsetId: sub.id });
                                        return (
                                            <button
                                                key={sub.id}
                                                onClick={() => selectRuleGroupTag(sub.id)}
                                                className={`px-3 py-2.5 rounded-xl text-sm font-bold border text-left flex items-center gap-2.5 transition-all
                                                    ${selected ? `${getToneSolidClass(subTokens.baseTone)} shadow-md` : `${subTokens.softBg} hover:opacity-80`}`}
                                                style={subTokens.stripeCss}
                                            >
                                                <span
                                                    className="w-3 h-3 rounded-full shrink-0"
                                                    style={{ backgroundColor: selected ? '#fff' : sub.color }}
                                                />
                                                {sub.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Shift targets */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                    Shift Targets <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {([
                                        { key: 'targetTotal', label: 'Total' },
                                        { key: 'targetHoliday', label: 'Holiday' },
                                        { key: 'targetWeekday', label: 'Weekday' },
                                    ] as const).map(({ key, label }) => (
                                        <div key={key}>
                                            <label className="block text-xs text-gray-400 mb-1">{label}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                                value={(editing as any)[key] ?? ''}
                                                onChange={e => setEditing({ ...editing, [key]: e.target.value ? parseInt(e.target.value) : undefined })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Unavailable dates — mini calendar */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Unavailable Dates</label>
                                <p className="text-xs text-gray-400 mb-3">Click days to mark them unavailable. The solver will skip these dates.</p>

                                {/* Month navigator */}
                                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setCalendarMonth(d => subMonths(d, 1))}
                                            className="p-1 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs font-bold text-gray-700">
                                            {format(calendarMonth, 'MMMM yyyy')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCalendarMonth(d => addMonths(d, 1))}
                                            className="p-1 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
                                        >
                                            <ChevronR className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Day-of-week headers */}
                                    <div className="grid grid-cols-7 border-b border-gray-100">
                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                            <div key={d} className={`text-center text-[10px] font-bold py-1.5 ${d === 'Su' || d === 'Sa' ? 'text-rose-400' : 'text-gray-400'}`}>
                                                {d}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Date grid */}
                                    <div className="grid grid-cols-7 p-1.5 gap-0.5">
                                        {eachDayOfInterval({
                                            start: startOfWeek(startOfMonth(calendarMonth)),
                                            end: endOfWeek(endOfMonth(calendarMonth)),
                                        }).map(day => {
                                            const dateStr = format(day, 'yyyy-MM-dd');
                                            const inMonth = isSameMonth(day, calendarMonth);
                                            const isUnavail = (editing.unavailableDates || []).includes(dateStr);
                                            const weekend = isWeekend(day);
                                            return (
                                                <button
                                                    key={dateStr}
                                                    type="button"
                                                    onClick={() => inMonth && toggleUnavailDate(dateStr)}
                                                    disabled={!inMonth}
                                                    className={`h-7 w-full rounded-lg text-[11px] font-semibold transition-all
                                                        ${!inMonth ? 'opacity-0 pointer-events-none' : ''}
                                                        ${isUnavail
                                                            ? 'bg-rose-500 text-white shadow-sm ring-1 ring-rose-400'
                                                            : weekend && inMonth
                                                                ? 'text-rose-400 hover:bg-rose-50'
                                                                : inMonth
                                                                    ? 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
                                                                    : ''
                                                        }`}
                                                >
                                                    {format(day, 'd')}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Selected dates summary */}
                                {(editing.unavailableDates || []).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {(editing.unavailableDates || []).map(d => (
                                            <span key={d}
                                                className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                                {d}
                                                <button type="button" onClick={() => toggleUnavailDate(d)} className="hover:text-rose-900">
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Save / Cancel footer */}
                        <div className="px-6 py-4 bg-white border-t border-gray-100 flex gap-3 shrink-0">
                            <button
                                onClick={cancelEdit}
                                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={savePerson}
                                disabled={!editing.name?.trim() || saving || !canMutate}
                                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20"
                                title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                            >
                                <Check className="w-4 h-4" />
                                {saving ? 'Saving…' : isNew ? 'Add Member' : 'Save Changes'}
                            </button>
                        </div>
                    </>
                ) : (
                    /* Welcome / idle state */
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                            <Users className="w-8 h-8 text-gray-300" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-500 text-sm">Select a person to view details</p>
                            <p className="text-xs text-gray-400 mt-1">Click any name in the list, then hit Edit</p>
                        </div>
                        {isEditor && (
                            <div className="flex flex-col items-center gap-2">
                                <button
                                    onClick={startAdd}
                                    disabled={!canMutate}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" /> Add New Member
                                </button>
                                <button
                                    onClick={() => { setShowSmartImport(true); setImportPreview(null); setImportResult(null); setImportError(null); }}
                                    disabled={!canMutate}
                                    className="flex items-center gap-2 px-5 py-2.5 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Sparkles className="w-4 h-4" /> Smart Import Schedule
                                </button>
                            </div>
                        )}
                    </div>
                )) : (
                    <div className="flex-1 overflow-auto p-6">
                        <div className="rounded-2xl border border-gray-200 bg-white mb-4">
                            <button
                                onClick={() => setShowInsights(prev => !prev)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                                    <p className="text-xs caps-micro text-gray-700">ผู้ช่วยวิเคราะห์ทีม</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showInsights ? 'rotate-180' : ''}`} />
                            </button>
                            {showInsights && (
                                <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                                    <div className="pt-3">
                                        <p className="text-[11px] text-gray-600 mb-2">
                                            สรุปเร็ว: เสี่ยงสูงตอนนี้ {highRiskIncludedCount} คน, มีแนวโน้มงานหนัก {likelyOverloadCount} คน, มีแนวโน้มงานน้อย {likelyUnderloadCount} คน
                                        </p>
                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 mb-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    onClick={handleApplyPriorityPack}
                                                    disabled={!canMutate}
                                                    className="px-2.5 py-1.5 rounded-lg text-[10px] caps-ui bg-indigo-600 text-white disabled:opacity-50"
                                                    title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                >
                                                    ใช้ Priority Pack
                                                </button>
                                                {activePriorityPack && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                                        พร้อมใช้ตอน Generate ({Object.keys(activePriorityPack.weightAdjustments).length})
                                                    </span>
                                                )}
                                            </div>
                                            {insightPackNotice && (
                                                <p
                                                    className={`mt-2 text-[11px] ${
                                                        insightPackNotice.kind === 'ok'
                                                            ? 'text-emerald-700'
                                                            : insightPackNotice.kind === 'warn'
                                                                ? 'text-amber-700'
                                                                : 'text-rose-700'
                                                    }`}
                                                >
                                                    {insightPackNotice.message}
                                                </p>
                                            )}
                                        </div>
                                        {attentionNowRows.length > 0 && (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 mb-3">
                                                <p className="text-[11px] caps-micro text-amber-800 mb-1">คนที่ควรโฟกัสตอนนี้</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {attentionNowRows.map(row => (
                                                        <button
                                                            key={`attention-${row.person.id}`}
                                                            onClick={() => setTimelinePersonId(row.person.id)}
                                                            className="text-[11px] px-2 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                                        >
                                                            {row.person.name} (risk {row.riskScore})
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[11px] caps-micro text-gray-600">แผนที่ความสมดุล</p>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setHeatmapScope('included')} className={`ui-btn px-2 py-1 text-[10px] caps-ui ${heatmapScope === 'included' ? 'ui-btn-accent shadow-sm' : 'ui-btn-neutral'}`}>เฉพาะ Included</button>
                                                <button onClick={() => setHeatmapScope('all')} className={`ui-btn px-2 py-1 text-[10px] caps-ui ${heatmapScope === 'all' ? 'ui-btn-accent shadow-sm' : 'ui-btn-neutral'}`}>ทั้งหมด</button>
                                            </div>
                                        </div>
                                        {isMobileV2 && (
                                            <div className="md:hidden space-y-2 mb-2">
                                                {filteredMetrics.map((metric) => (
                                                    <div key={`mobile-heat-${metric.personId}`} className="rounded-xl border border-gray-200 bg-white p-2.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs font-bold text-gray-900 truncate">{metric.name}</p>
                                                            <span className="text-xs font-bold text-indigo-700">{metric.fairnessScore.toFixed(1)}</span>
                                                        </div>
                                                        <div className="mt-1 grid grid-cols-2 gap-1.5 text-[11px]">
                                                            <span className={`px-2 py-1 rounded ${getHeatmapCellClass(metric.fairness.weekdayGap)}`}>Weekday {metric.fairness.weekdayGap.toFixed(2)}</span>
                                                            <span className={`px-2 py-1 rounded ${getHeatmapCellClass(metric.fairness.holidayGap)}`}>Holiday {metric.fairness.holidayGap.toFixed(2)}</span>
                                                            <span className={`px-2 py-1 rounded ${getHeatmapCellClass(metric.fairness.noonGap)}`}>Noon {metric.fairness.noonGap.toFixed(2)}</span>
                                                            <span className={`px-2 py-1 rounded ${getHeatmapCellClass(metric.fairness.consecutivePressure)}`}>Consecutive {metric.fairness.consecutivePressure.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="overflow-x-auto hidden md:block">
                                            <table className="min-w-[760px] w-full text-[11px]">
                                                <thead>
                                                    <tr className="text-gray-500">
                                                        <th className="text-left p-2">ชื่อ</th>
                                                        <th className="text-left p-2">ต่างจากทีม (วันปกติ)</th>
                                                        <th className="text-left p-2">ต่างจากทีม (วันหยุด)</th>
                                                        <th className="text-left p-2">ต่างจากทีม (Noon)</th>
                                                        <th className="text-left p-2">แรงกดดันวันเว้นวัน</th>
                                                        <th className="text-left p-2">แรงกดดันเวรติดกัน</th>
                                                        <th className="text-left p-2">คะแนนสมดุล</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredMetrics.map(metric => (
                                                        <tr key={`heat-${metric.personId}`} className="border-t border-gray-100">
                                                            <td className="p-2 font-bold text-gray-800">{metric.name}</td>
                                                            <td className={`p-2 rounded ${getHeatmapCellClass(metric.fairness.weekdayGap)}`}>{metric.fairness.weekdayGap.toFixed(2)}</td>
                                                            <td className={`p-2 rounded ${getHeatmapCellClass(metric.fairness.holidayGap)}`}>{metric.fairness.holidayGap.toFixed(2)}</td>
                                                            <td className={`p-2 rounded ${getHeatmapCellClass(metric.fairness.noonGap)}`}>{metric.fairness.noonGap.toFixed(2)}</td>
                                                            <td className={`p-2 rounded ${getHeatmapCellClass(metric.fairness.alternatePressure)}`}>{metric.fairness.alternatePressure.toFixed(2)}</td>
                                                            <td className={`p-2 rounded ${getHeatmapCellClass(metric.fairness.consecutivePressure)}`}>{metric.fairness.consecutivePressure.toFixed(2)}</td>
                                                            <td className="p-2 font-bold text-indigo-700">{metric.fairnessScore.toFixed(1)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] caps-micro text-gray-600 mb-2">คาดการณ์ภาระงานเดือนถัดไป</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {forecastResults.filter(row => row.included).slice(0, 8).map(row => (
                                                <div key={`forecast-${row.personId}`} className="rounded-xl border border-gray-200 p-2.5">
                                                    <p className="text-xs font-bold text-gray-800">{row.name}</p>
                                                    <p className="text-[11px] text-gray-600 mt-1">คาดว่า {row.expectedMin}-{row.expectedMax} เวร · วันหยุด {row.expectedHoliday} · Noon {row.expectedNoon}</p>
                                                    <div className="mt-1 flex items-center gap-1.5">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.status === 'likely_overload' ? 'bg-rose-100 text-rose-700' : row.status === 'likely_underload' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                            {row.status === 'likely_overload' ? 'มีแนวโน้มงานหนัก' : row.status === 'likely_underload' ? 'มีแนวโน้มงานน้อย' : 'สมดุล'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500">ความมั่นใจ {row.confidence}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-gray-200 p-3">
                                        <p className="text-[11px] caps-micro text-gray-600 mb-2">พื้นที่จำลองปรับสมดุล</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button onClick={runRebalanceSimulation} className="px-2.5 py-1.5 rounded-lg text-[10px] caps-ui bg-indigo-600 text-white">จำลอง</button>
                                            {simulationPlan && (
                                                <>
                                                    <button disabled={!canMutate} onClick={applySimulation} className="px-2.5 py-1.5 rounded-lg text-[10px] caps-ui bg-emerald-600 text-white disabled:opacity-50">ใช้คำแนะนำ</button>
                                                    <button disabled={!canMutate || !simulationSnapshot} onClick={rollbackSimulation} className="px-2.5 py-1.5 rounded-lg text-[10px] caps-ui bg-gray-100 text-gray-700 disabled:opacity-50">ย้อนกลับ</button>
                                                </>
                                            )}
                                        </div>
                                        {simulationPlan && (
                                            <div className="mt-2 text-[11px] text-gray-600">
                                                <p>{simulationPlan.summary}</p>
                                                <p className="mt-0.5">ความแปรปรวนความสมดุล {simulationPlan.beforeVariance.toFixed(2)} → {simulationPlan.afterVariance.toFixed(2)}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs caps-micro text-gray-700">สรุปทีมที่ Included</p>
                                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{includedRosterRows.length}</span>
                            </div>
                            {isMobileV2 && (
                                <div className="md:hidden space-y-2">
                                    {groupedIncludedRows.flatMap(group => group.rows).map((row) => (
                                        <button
                                            key={`mobile-summary-${row.person.id}`}
                                            onClick={() => setTimelinePersonId(row.person.id)}
                                            className="w-full text-left rounded-xl border border-gray-200 bg-white p-3"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-gray-900 truncate">{row.person.name}</p>
                                                <span className="text-[11px] font-bold text-gray-700">
                                                    {row.personSummary.firstCount}/{row.personSummary.secondCount}/{row.personSummary.thirdCount}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-gray-600">
                                                Total {row.personSummary.weekday + row.personSummary.holiday} · Weekday {row.personSummary.weekday} · Holiday {row.personSummary.holiday}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="overflow-x-auto hidden md:block">
                                <table className="min-w-[980px] w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50">
                                            <th className="text-left p-2 caps-micro text-gray-500">Name</th>
                                            <th className="text-left p-2 caps-micro text-gray-500 bg-slate-50/70">Weekday</th>
                                            <th className="text-left p-2 caps-micro text-gray-500">Holiday</th>
                                            <th className="text-left p-2 caps-micro text-gray-500 bg-slate-50/70">Total</th>
                                            <th className="text-left p-2 caps-micro text-gray-500">Alt Days</th>
                                            <th className="text-left p-2 caps-micro text-gray-500 bg-slate-50/70">Consecutive</th>
                                            <th className="text-left p-2 caps-micro text-gray-500">Noon</th>
                                            <th className="text-left p-2 caps-micro text-gray-500 bg-slate-50/70">1st/2nd/3rd</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedIncludedRows.map(group => (
                                            <React.Fragment key={`summary-${group.key}`}>
                                                <tr className="border-y border-gray-200" style={{ backgroundColor: withAlpha(group.color, 0.24) }}>
                                                    <td colSpan={8} className="p-2 text-[11px] font-bold text-gray-800 uppercase tracking-wider">
                                                        {group.label} · {group.rows.length}
                                                    </td>
                                                </tr>
                                                {group.rows.map(row => (
                                                    <tr key={`summary-row-${row.person.id}`} className="border-b border-gray-100">
                                                        <td className="p-2 font-bold text-gray-900">
                                                            <button onClick={() => setTimelinePersonId(row.person.id)} className="hover:underline">{row.person.name}</button>
                                                        </td>
                                                        <td className="p-2 text-gray-900 font-semibold bg-slate-50/70">{row.personSummary.weekday}</td>
                                                        <td className="p-2 text-gray-900 font-semibold">{row.personSummary.holiday}</td>
                                                        <td className="p-2 text-gray-900 font-bold bg-slate-50/70">{row.personSummary.weekday + row.personSummary.holiday}</td>
                                                        <td className="p-2 text-gray-900 font-semibold">{row.personSummary.everyOtherDayPairs}</td>
                                                        <td className="p-2 text-gray-900 font-semibold bg-slate-50/70">{row.personSummary.consecutivePairs}</td>
                                                        <td className="p-2 text-gray-900 font-semibold">
                                                            {row.personSummary.noonCount} <span className="text-gray-500 font-normal">({formatDayList(row.personSummary.noonDates)})</span>
                                                        </td>
                                                        <td className="p-2 text-gray-900 font-semibold bg-slate-50/70">
                                                            {row.personSummary.firstCount}/{row.personSummary.secondCount}/{row.personSummary.thirdCount}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                        {includedRosterRows.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="p-4 text-center text-gray-400">เดือนนี้ยังไม่มีคนที่ Included</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div
                                className={`rounded-2xl border p-4 bg-white ${dropBucket === 'included' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200'}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDropBucket('included');
                                }}
                                onDragLeave={() => setDropBucket(null)}
                                onDrop={(e) => onDropToBucket('included', e)}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Included Lineup</p>
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                        {includedRosterRows.length}
                                    </span>
                                </div>
                                <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
                                    {groupedIncludedRows.map(group => (
                                        <div key={`in-${group.key}`} className="space-y-2">
                                            <button
                                                onClick={() => toggleRosterGroup(`in-${group.key}`)}
                                                className="w-full border rounded-xl px-2.5 py-2 text-left"
                                                style={{ backgroundColor: withAlpha(group.color, 0.2), borderColor: withAlpha(group.color, 0.5) }}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <ChevronDown className={`w-3.5 h-3.5 mt-0.5 text-gray-600 transition-transform ${expandedRosterGroups.has(`in-${group.key}`) ? 'rotate-180' : ''}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                                                            {group.label} · {group.rows.length} คน
                                                        </p>
                                                        <p className="text-[10px] text-gray-700 truncate" title={group.rows.map(row => row.person.name).join(', ')}>
                                                            {group.namesPreview}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                            {expandedRosterGroups.has(`in-${group.key}`) && group.rows.map(row => (
                                                <div
                                                    key={`in-card-${row.person.id}`}
                                                    draggable={canMutate}
                                                    onDragStart={(e) => onDragStartPerson(row.person.id, e)}
                                                    onDragEnd={() => { setDraggingPersonId(null); setDropBucket(null); }}
                                                    className="rounded-xl border border-gray-200 bg-white p-3 cursor-grab active:cursor-grabbing"
                                                    style={{ borderLeftWidth: 4, borderLeftColor: row.subset?.color || '#e5e7eb' }}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-gray-900 truncate">{row.person.name}</p>
                                                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                                                                    {row.callLabel}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSubsetPickerFor(prev => prev === row.person.id ? null : row.person.id)}
                                                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                                                                    style={row.subset ? { backgroundColor: row.subset.color, color: '#1f2937' } : undefined}
                                                                >
                                                                    {row.subset?.labelEnTh || 'Set Rule Group'}
                                                                </button>
                                                            </div>
                                                            {subsetPickerFor === row.person.id && (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {subsetOptions.map(option => (
                                                                        <button
                                                                            key={`subset-${row.person.id}-${option.id}`}
                                                                            disabled={!canMutate}
                                                                            onClick={() => updateSubsetTag(row.person, option.id)}
                                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50"
                                                                        >
                                                                            {option.labelEnTh}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <ArrowRightLeft className="w-4 h-4 text-gray-300 shrink-0" />
                                                    </div>
                                                    <p className="mt-2 text-[11px] text-gray-500">
                                                        Total {row.personSummary.total} · Weekday {row.personSummary.weekday} · Holiday {row.personSummary.holiday} · Noon {row.personSummary.noonCount}
                                                    </p>
                                                    {(() => {
                                                        const metric = metricsById.get(row.person.id);
                                                        if (!metric || metric.riskAlerts.length === 0) return null;
                                                        return (
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {metric.riskAlerts.map(alert => (
                                                                    <span key={`risk-in-${row.person.id}-${alert.kind}`} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                                                        {alert.message}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                    <p className="mt-1 text-[11px] text-gray-600">{row.diagnosisText}</p>
                                                    <p className="mt-1 text-[11px] font-semibold text-gray-700">{row.nextActionText}</p>
                                                    <div className="mt-2 flex items-center gap-1.5">
                                                        <button
                                                            disabled={!canMutate}
                                                            onClick={() => toggleIncluded(row.person.id, true)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 text-white disabled:opacity-50"
                                                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                        >
                                                            Exclude
                                                        </button>
                                                        <button
                                                            disabled={!canMutate}
                                                            onClick={() => setEligibility(row.person.id, 'template')}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600 disabled:opacity-50"
                                                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                        >
                                                            Use Template Default
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                    {includedRosterRows.length === 0 && (
                                        <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                                            Drop people here to include in this month.
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div
                                className={`rounded-2xl border p-4 bg-white ${dropBucket === 'excluded' ? 'border-rose-400 ring-2 ring-rose-200' : 'border-gray-200'}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDropBucket('excluded');
                                }}
                                onDragLeave={() => setDropBucket(null)}
                                onDrop={(e) => onDropToBucket('excluded', e)}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold uppercase tracking-widest text-rose-700">Excluded Bench</p>
                                    <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                                        {excludedRosterRows.length}
                                    </span>
                                </div>
                                <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
                                    {groupedExcludedRows.map(group => (
                                        <div key={`out-${group.key}`} className="space-y-2">
                                            <button
                                                onClick={() => toggleRosterGroup(`out-${group.key}`)}
                                                className="w-full border rounded-xl px-2.5 py-2 text-left"
                                                style={{ backgroundColor: withAlpha(group.color, 0.2), borderColor: withAlpha(group.color, 0.5) }}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <ChevronDown className={`w-3.5 h-3.5 mt-0.5 text-gray-600 transition-transform ${expandedRosterGroups.has(`out-${group.key}`) ? 'rotate-180' : ''}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                                                            {group.label} · {group.rows.length} คน
                                                        </p>
                                                        <p className="text-[10px] text-gray-700 truncate" title={group.rows.map(row => row.person.name).join(', ')}>
                                                            {group.namesPreview}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                            {expandedRosterGroups.has(`out-${group.key}`) && group.rows.map(row => (
                                                <div
                                                    key={`out-card-${row.person.id}`}
                                                    draggable={canMutate}
                                                    onDragStart={(e) => onDragStartPerson(row.person.id, e)}
                                                    onDragEnd={() => { setDraggingPersonId(null); setDropBucket(null); }}
                                                    className="rounded-xl border border-gray-200 bg-white p-3 cursor-grab active:cursor-grabbing"
                                                    style={{ borderLeftWidth: 4, borderLeftColor: row.subset?.color || '#e5e7eb' }}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-gray-900 truncate">{row.person.name}</p>
                                                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                                                                    {row.callLabel}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSubsetPickerFor(prev => prev === row.person.id ? null : row.person.id)}
                                                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                                                                    style={row.subset ? { backgroundColor: row.subset.color, color: '#1f2937' } : undefined}
                                                                >
                                                                    {row.subset?.labelEnTh || 'Set Rule Group'}
                                                                </button>
                                                            </div>
                                                            {subsetPickerFor === row.person.id && (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {subsetOptions.map(option => (
                                                                        <button
                                                                            key={`subset-out-${row.person.id}-${option.id}`}
                                                                            disabled={!canMutate}
                                                                            onClick={() => updateSubsetTag(row.person, option.id)}
                                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50"
                                                                        >
                                                                            {option.labelEnTh}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <ArrowRightLeft className="w-4 h-4 text-gray-300 shrink-0" />
                                                    </div>
                                                    <p className="mt-2 text-[11px] text-gray-500">
                                                        Total {row.personSummary.total} · Weekday {row.personSummary.weekday} · Holiday {row.personSummary.holiday} · Noon {row.personSummary.noonCount}
                                                    </p>
                                                    {(() => {
                                                        const metric = metricsById.get(row.person.id);
                                                        if (!metric || metric.riskAlerts.length === 0) return null;
                                                        return (
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {metric.riskAlerts.map(alert => (
                                                                    <span key={`risk-out-${row.person.id}-${alert.kind}`} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                                                        {alert.message}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                    <p className="mt-1 text-[11px] text-gray-600">{row.diagnosisText}</p>
                                                    <p className="mt-1 text-[11px] font-semibold text-gray-700">{row.nextActionText}</p>
                                                    <div className="mt-2 flex items-center gap-1.5">
                                                        <button
                                                            disabled={!canMutate}
                                                            onClick={() => toggleIncluded(row.person.id, false)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 text-white disabled:opacity-50"
                                                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                        >
                                                            Include
                                                        </button>
                                                        <button
                                                            disabled={!canMutate}
                                                            onClick={() => setEligibility(row.person.id, 'template')}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600 disabled:opacity-50"
                                                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                        >
                                                            Use Template Default
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                    {excludedRosterRows.length === 0 && (
                                        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                                            Drop people here to exclude from this month.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>{/* ── End content row ── */}

            {/* Smart Import Modal */}
            {timelinePersonId && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-5 w-full max-w-3xl shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <LineChart className="w-4 h-4 text-indigo-600" />
                                <h3 className="text-sm font-bold text-gray-900">Personal Timeline (6 months) · {people.find(p => p.id === timelinePersonId)?.name || timelinePersonId}</h3>
                            </div>
                            <button onClick={() => setTimelinePersonId(null)} className="p-1 rounded hover:bg-gray-100">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        {isMobileV2 && (
                            <div className="md:hidden space-y-2">
                                {selectedTimeline.map(point => (
                                    <div key={`timeline-mobile-${point.monthKey}`} className="rounded-xl border border-gray-200 p-2.5">
                                        <p className="text-xs font-bold text-gray-800">{point.monthKey}</p>
                                        <p className="mt-1 text-[11px] text-gray-600">
                                            1st {point.firstCount} · 2nd {point.secondCount} · 3rd {point.thirdCount} · Noon {point.noonCount}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-indigo-700 font-semibold">
                                            Fairness {point.fairnessScore.toFixed(1)} · Alt {point.alternatePressure}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="overflow-x-auto hidden md:block">
                            <table className="min-w-[780px] w-full text-xs">
                                <thead>
                                    <tr className="bg-gray-50 border-y border-gray-100">
                                        <th className="p-2 text-left text-gray-500">Month</th>
                                        <th className="p-2 text-left text-gray-500">1st</th>
                                        <th className="p-2 text-left text-gray-500">2nd</th>
                                        <th className="p-2 text-left text-gray-500">3rd</th>
                                        <th className="p-2 text-left text-gray-500">Noon</th>
                                        <th className="p-2 text-left text-gray-500">Fairness</th>
                                        <th className="p-2 text-left text-gray-500">Alt Pressure</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedTimeline.map(point => (
                                        <tr key={`timeline-${point.monthKey}`} className="border-b border-gray-100">
                                            <td className="p-2 font-bold text-gray-800">{point.monthKey}</td>
                                            <td className="p-2 text-emerald-700">{point.firstCount}</td>
                                            <td className="p-2 text-amber-700">{point.secondCount}</td>
                                            <td className="p-2 text-sky-700">{point.thirdCount}</td>
                                            <td className="p-2 text-violet-700">{point.noonCount}</td>
                                            <td className="p-2 text-indigo-700 font-bold">{point.fairnessScore.toFixed(1)}</td>
                                            <td className="p-2 text-gray-700">{point.alternatePressure}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {showSmartImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-7 w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-base">Smart Import</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Upload a schedule image — Gemini AI will extract shifts.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSmartImport(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Upload zone */}
                        <div
                            className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const file = e.dataTransfer.files[0];
                                if (file) handleFileSelect(file);
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                            />
                            {importPreview ? (
                                <div className="flex flex-col items-center gap-2 w-full">
                                    <img src={`data:${importPreview.mime};base64,${importPreview.base64}`} alt="preview" className="max-h-48 rounded-xl object-contain shadow-sm" />
                                    <span className="text-xs text-gray-500 font-medium">{importPreview.name}</span>
                                    <span className="text-[10px] text-emerald-600 font-bold">Click to change image</span>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-gray-300" />
                                    <p className="text-sm font-bold text-gray-500">Drop image here or click to upload</p>
                                    <p className="text-xs text-gray-400">PNG, JPG, WEBP supported</p>
                                </>
                            )}
                        </div>

                        {importError && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{importError}</span>
                            </div>
                        )}

                        {importResult && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                <p className="text-xs font-bold text-emerald-700 mb-2">{importResult.length} shift{importResult.length !== 1 ? 's' : ''} extracted:</p>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {importResult.map((s: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-emerald-800">
                                            <span className="font-mono font-bold">{s.date}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-200 font-bold">{s.level}</span>
                                            <span>{people.find(p => p.id === s.personId)?.name || s.personId}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSmartImport(false)}
                                className="flex-1 py-2.5 border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            {importResult ? (
                                <button
                                    onClick={applyImportedShifts}
                                    disabled={!canMutate}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Apply to Calendar
                                </button>
                            ) : (
                                <button
                                    onClick={runSmartImport}
                                    disabled={!importPreview || importLoading}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {importLoading ? 'Analysing…' : 'Extract Shifts'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletePreview && (
                <GsapPresence preset="banner" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
                    <GsapPresence preset="modal" className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl border border-gray-100">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5 text-rose-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-base">Move to Deleted Folder?</h3>
                                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                                    <strong className="text-gray-700">{deletePreview.person.name}</strong> จะถูกซ่อนจากรายชื่อหลัก และถอดเวรที่เชื่อมอยู่
                                </p>
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 space-y-1">
                                    <p>เวรที่จะถูกถอด: <strong>{deletePreview.removedShiftCount}</strong> รายการ</p>
                                    <p>1A: {deletePreview.affectedByLevel['1A']} | 1B: {deletePreview.affectedByLevel['1B']} | 2: {deletePreview.affectedByLevel['2']} | 3: {deletePreview.affectedByLevel['3']}</p>
                                    <p>เดือนที่ได้รับผลกระทบ: {deletePreview.affectedMonths.length ? deletePreview.affectedMonths.join(', ') : '-'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletePreview(null)}
                                className="flex-1 py-2.5 border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 bg-rose-600 text-white rounded-2xl text-sm font-bold hover:bg-rose-700 transition-all shadow-sm shadow-rose-500/20"
                            >
                                Move to Folder
                            </button>
                        </div>
                    </GsapPresence>
                </GsapPresence>
            )}
        </div>
    );
}
