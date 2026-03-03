import React, { useState, useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { useConfigStore } from '../../lib/store/useConfigStore';
import { useUIStore } from '../../lib/store/useUIStore';
import { useThemeStore } from '../../lib/store/useThemeStore';
import {
    ChevronLeft, ChevronRight,
    AlertTriangle, X, CheckCircle, Save, History, Calendar as CalendarIcon, User, Users, Search,
    Trash2, Sparkles, CalendarX2, Pencil, Plus, FileDown,
} from 'lucide-react';
import {
    isBefore,
    startOfDay,
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isWeekend
} from 'date-fns';
import type { Shift, Violation, Person, ScheduleVersion } from '../../lib/shiftplan/types';
import { DEFAULT_SUBSETS } from '../../lib/shiftplan/constants';
import { useCumulativeStore } from '../../lib/store/useCumulativeStore';
import type { MonthRoster, RosterTemplate } from '../../lib/roster';
import { buildMonthSummary, getPersonSummaryGroup, getSummaryGroupDefinitions } from '../../lib/roster';
import ViolationPanel from './components/ViolationPanel';
import SmartImportModal from './components/SmartImportModal';
import HistoryModal from './components/HistoryModal';
import { GsapPresence } from '../../components/animations/GsapPresence';
import {
    apiFetch,
    ensureApiSuccess,
    getWorkspaceId,
    isPreviewReadonlyError,
    PREVIEW_READONLY_MESSAGE,
} from '../../lib/workspaceApi';
import { deriveRiskAlertsFromSummary } from '../../lib/insights/metrics';
import { mergeCumulativeWeights } from '../../lib/insights/priorityPack';
import { canAnimate, getGsapVars } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import {
    CALL_TAG_DISPLAY,
    CALL_TAG_IDS,
    getSubsetDisplay,
    getSubsetOptions,
    replaceSubsetTag,
} from '../shared/tagDisplay';
import { countRuleGroupTags, normalizePersonTags } from '../shared/personTagModel';
import { getCombinedSemanticTokens, getTagThemeTokens, getToneSoftClass, getToneTextClass } from '../shared/semanticColors';
import {
    buildMonthShiftsByPersonIndex,
    buildPeopleByIdIndex,
    buildShiftsByDateIndex,
} from '../../lib/perf/renderIndexes';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { featureFlags } from '../../config/flags';
import DayEditorSheet, { type DayEditorPayload } from '../../components/mobile/DayEditorSheet';

const CORE_LEVELS = new Set(['1A', '1B', '2', '3']);

const CALL_TAGS = CALL_TAG_IDS.map(id => ({ id, label: CALL_TAG_DISPLAY[id].label, color: CALL_TAG_DISPLAY[id].softClass }));
const MONTH_LOCK_FALLBACK_KEY = 'wayne_month_lock_fallback_v1';
const MONTH_LOCK_VERSION_SNAPSHOT_KEY = 'wayne_month_lock_version_snapshots_v1';

type MonthLockShape = {
    versionId: string;
    shifts: Shift[];
    people: Array<{ personId: string; name: string; color?: string | null }>;
    lockedAt: number;
};

type DeletePreviewShape = {
    person: Person;
    removedShiftCount: number;
    affectedMonths: string[];
    affectedByLevel: Record<'1A' | '1B' | '2' | '3', number>;
    affectedDatesSample: string[];
    warnings: string[];
};

type RestoreConflictMode = 'skip' | 'overwrite';
type RestoreConflictEntry = {
    date: string;
    level: string;
    existingPersonId: string;
    incomingPersonId: string;
};
type RestoreSummary = {
    restoredPeopleCount: number;
    restoredShiftCount: number;
    skippedConflictCount: number;
    overwrittenCount: number;
    monthKey: string;
};

type ToolbarTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';

const SLOT_BY_LEVEL: Record<string, 'first_call' | 'second_call' | 'third_call' | undefined> = {
    '1A': 'first_call',
    '1B': 'first_call',
    '2': 'second_call',
    '3': 'third_call',
};

function readMonthLockFallback(monthKey: string): MonthLockShape | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(MONTH_LOCK_FALLBACK_KEY);
        if (!raw) return null;
        const all = JSON.parse(raw) as Record<string, MonthLockShape>;
        const wk = getWorkspaceId();
        return all[`${wk}:${monthKey}`] || null;
    } catch {
        return null;
    }
}

function writeMonthLockFallback(monthKey: string, value: MonthLockShape | null) {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(MONTH_LOCK_FALLBACK_KEY);
        const all = raw ? (JSON.parse(raw) as Record<string, MonthLockShape>) : {};
        const wk = getWorkspaceId();
        const key = `${wk}:${monthKey}`;
        if (value) all[key] = value;
        else delete all[key];
        localStorage.setItem(MONTH_LOCK_FALLBACK_KEY, JSON.stringify(all));
    } catch {
        // ignore localStorage failures
    }
}

function readVersionSnapshotFallback(versionId: string): MonthLockShape['people'] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(MONTH_LOCK_VERSION_SNAPSHOT_KEY);
        if (!raw) return null;
        const all = JSON.parse(raw) as Record<string, MonthLockShape['people']>;
        const wk = getWorkspaceId();
        return all[`${wk}:${versionId}`] || null;
    } catch {
        return null;
    }
}

function writeVersionSnapshotFallback(versionId: string, people: MonthLockShape['people']) {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(MONTH_LOCK_VERSION_SNAPSHOT_KEY);
        const all = raw ? (JSON.parse(raw) as Record<string, MonthLockShape['people']>) : {};
        const wk = getWorkspaceId();
        all[`${wk}:${versionId}`] = people;
        localStorage.setItem(MONTH_LOCK_VERSION_SNAPSHOT_KEY, JSON.stringify(all));
    } catch {
        // ignore localStorage failures
    }
}

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function parseColorToRgb(input?: string | null): { r: number; g: number; b: number } | null {
    if (!input) return null;
    const color = input.trim();
    const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const raw = hex[1];
        const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
        const r = parseInt(expanded.slice(0, 2), 16);
        const g = parseInt(expanded.slice(2, 4), 16);
        const b = parseInt(expanded.slice(4, 6), 16);
        return { r, g, b };
    }
    const rgb = color.match(/^rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)$/i);
    if (rgb) {
        const r = Math.max(0, Math.min(255, Number(rgb[1])));
        const g = Math.max(0, Math.min(255, Number(rgb[2])));
        const b = Math.max(0, Math.min(255, Number(rgb[3])));
        return { r, g, b };
    }
    return null;
}

function mixWithWhite(channel: number, amount: number): number {
    return Math.round(channel + (255 - channel) * amount);
}

function toPastelCellStyle(input?: string | null): React.CSSProperties | null {
    const rgb = parseColorToRgb(input);
    if (!rgb) return null;
    const { r, g, b } = rgb;
    const bgR = mixWithWhite(r, 0.78);
    const bgG = mixWithWhite(g, 0.78);
    const bgB = mixWithWhite(b, 0.78);
    const borderR = mixWithWhite(r, 0.52);
    const borderG = mixWithWhite(g, 0.52);
    const borderB = mixWithWhite(b, 0.52);
    return {
        backgroundColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
        borderColor: `rgb(${borderR}, ${borderG}, ${borderB})`,
        color: '#334155',
    };
}

function toPastelOptionStyle(input?: string | null): React.CSSProperties {
    const rgb = parseColorToRgb(input);
    if (!rgb) {
        return { backgroundColor: '#f8fafc', color: '#334155' };
    }
    const { r, g, b } = rgb;
    const bgR = mixWithWhite(r, 0.82);
    const bgG = mixWithWhite(g, 0.82);
    const bgB = mixWithWhite(b, 0.82);
    return {
        backgroundColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
        color: '#334155',
    };
}

export default function CalendarDashboard() {
    const motionTier = useMotionTier();
    const pageGradient = getGradientRecipe('calendar', 'page-bg');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSelectingNoon, setIsSelectingNoon] = useState(false);
    const [showClearMonthConfirm, setShowClearMonthConfirm] = useState(false);
    const [manualHighlights, setManualHighlights] = useState<string[]>([]);
    const [firstCallCount, setFirstCallCount] = useState(2);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [monthLock, setMonthLock] = useState<MonthLockShape | null>(null);
    const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null);
    const [showPersonPanel, setShowPersonPanel] = useState(true);
    const [layoutAnimating, setLayoutAnimating] = useState(false);
    const [personSearch, setPersonSearch] = useState('');
    const [showNo3rdCallModal, setShowNo3rdCallModal] = useState(false);
    const [showHardViolationConfirmModal, setShowHardViolationConfirmModal] = useState(false);
    const [pendingMergedShifts, setPendingMergedShifts] = useState<Shift[] | null>(null);
    const [pendingHardViolationCount, setPendingHardViolationCount] = useState(0);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [showGenDropdown, setShowGenDropdown] = useState(false);

    // Month/year jump picker
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const monthPickerRef = useRef<HTMLDivElement>(null);
    const genDropdownRef = useRef<HTMLDivElement>(null);
    const clearModalRef = useRef<HTMLDivElement>(null);
    const loadingPopupRef = useRef<HTMLDivElement>(null);

    // Off-day editing mode (click calendar dates to toggle unavailability for a person)
    const [offDayPersonId, setOffDayPersonId] = useState<string | null>(null);

    const [panelCollapsed, setPanelCollapsed] = useState<Set<string>>(new Set());
    const [subsetPickerFor, setSubsetPickerFor] = useState<string | null>(null);
    const [eligibilityPickerFor, setEligibilityPickerFor] = useState<string | null>(null);
    const [tagEditorFor, setTagEditorFor] = useState<string | null>(null);
    const [templates, setTemplates] = useState<RosterTemplate[]>([]);
    const [monthRoster, setMonthRoster] = useState<MonthRoster | null>(null);
    const [deletePreview, setDeletePreview] = useState<DeletePreviewShape | null>(null);
    const [restoreConflict, setRestoreConflict] = useState<{ versionId: string; conflicts: RestoreConflictEntry[] } | null>(null);
    const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickAddDraft, setQuickAddDraft] = useState<{ name: string; callTagIds: Array<'first_call' | 'second_call' | 'third_call'>; subsetId: string | '' }>({
        name: '',
        callTagIds: [],
        subsetId: '',
    });
    const [quickAddCallMenuOpen, setQuickAddCallMenuOpen] = useState(false);
    const [quickAddSaving, setQuickAddSaving] = useState(false);
    const [quickAddError, setQuickAddError] = useState<string | null>(null);
    const highlightsLoadedRef = useRef(false);
    const ruleGroupHygieneNoticeShownRef = useRef(false);

    // Debounce for shift autosave
    const shiftAutosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingShiftAutosaveRef = useRef<Shift[] | null>(null);

    // Smart import state lives inside SmartImportModal
    const [showSmartImport, setShowSmartImport] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [mobileDayEditor, setMobileDayEditor] = useState<DayEditorPayload | null>(null);
    const rowDensity: 'comfortable' = 'comfortable';
    const panelWidthMode: 'balanced' = 'balanced';
    const [viewportWidth, setViewportWidth] = useState<number>(() => (
        typeof window === 'undefined' ? 1440 : window.innerWidth
    ));
    const panelWidthPx = panelWidthMode === 'balanced'
        ? (viewportWidth < 1280 ? 300 : viewportWidth < 1536 ? 316 : 332)
        : 320;
    const rootRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const calendarPaneRef = useRef<HTMLDivElement>(null);
    const personPanelRef = useRef<HTMLElement>(null);
    const prevShowPersonPanelRef = useRef(showPersonPanel);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarDays = eachDayOfInterval({
        start: startOfWeek(monthStart),
        end: endOfWeek(monthEnd),
    });

    const {
        shifts,
        setShifts,
        peopleByMonth,
        setPeopleForMonth,
        setLastSolveMeta,
        insightPriorityPack,
        clearInsightPriorityPackForMonth,
    } = useScheduleStore();
    const { holidays, setHolidays, versions, setVersions, schedulingConfig, setSchedulingConfig, setTags } = useConfigStore();
    const {
        viewMode,
        setViewMode,
        isEditor,
        canMutate,
        isPreviewReadonly,
        tableDensity,
        weekendHighlight,
        dimPastDays,
        setLastFocusedDay,
    } = useUIStore();

    const isMobileV2 = featureFlags.mobileV2 && isMobileViewport;

    // Simulate legacy Noon days store (needs lifting to useConfigStore or replacing)
    // For now we persist to local state just to give back the UI temporarily
    const [noonDays, setNoonDays] = useState<string[]>([]);

    const monthKey = format(currentDate, 'yyyy-MM');
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('wayne:month-label', { detail: { monthLabel: format(currentDate, 'MMM yyyy') } }));
    }, [currentDate]);
    const monthLocked = !!monthLock;
    const people = peopleByMonth['all'] || [];
    const peopleById = useMemo(() => buildPeopleByIdIndex(people), [people]);
    const monthLockPeopleById = useMemo(() => {
        const map = new Map<string, { name: string; color?: string | null }>();
        for (const person of monthLock?.people || []) {
            map.set(person.personId, { name: person.name, color: person.color || null });
        }
        return map;
    }, [monthLock]);
    const subsetOptions = useMemo(() => getSubsetOptions(schedulingConfig), [schedulingConfig]);
    const includedSet = useMemo(() => new Set(monthRoster?.includedPersonIds || people.map(p => p.id)), [monthRoster, people]);
    const activePeople = useMemo(() => people.filter(p => includedSet.has(p.id)), [people, includedSet]);
    const monthSummary = buildMonthSummary(people, shifts, monthKey, holidays.map(h => h.date), noonDays);
    const activeInsightPack = useMemo(
        () => (insightPriorityPack?.monthKey === monthKey ? insightPriorityPack : null),
        [insightPriorityPack, monthKey],
    );
    const summaryGroupOrderMap = useMemo(
        () => new Map(getSummaryGroupDefinitions(DEFAULT_SUBSETS).map(group => [group.id, group.order])),
        [],
    );
    const sortedActivePeople = useMemo(() => {
        return [...activePeople].sort((a, b) => {
            const aGroup = getPersonSummaryGroup(a, DEFAULT_SUBSETS);
            const bGroup = getPersonSummaryGroup(b, DEFAULT_SUBSETS);
            const aOrder = summaryGroupOrderMap.get(aGroup.id) ?? 9_999;
            const bOrder = summaryGroupOrderMap.get(bGroup.id) ?? 9_999;
            if (aOrder !== bOrder) return aOrder - bOrder;

            const aSubset = getSubsetDisplay(a.tagIds || [], schedulingConfig)?.labelEnTh || '';
            const bSubset = getSubsetDisplay(b.tagIds || [], schedulingConfig)?.labelEnTh || '';
            const subsetCmp = aSubset.localeCompare(bSubset, undefined, { sensitivity: 'base' });
            if (subsetCmp !== 0) return subsetCmp;

            const aColor = a.color || '';
            const bColor = b.color || '';
            const colorCmp = aColor.localeCompare(bColor, undefined, { sensitivity: 'base' });
            if (colorCmp !== 0) return colorCmp;

            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
    }, [activePeople, schedulingConfig, summaryGroupOrderMap]);
    const secondPoolTokens = useMemo(
        () => getCombinedSemanticTokens({
            slot: 'second_call',
            tagIds: activePeople.flatMap((person) => person.tagIds || []),
        }),
        [activePeople],
    );
    const thirdPoolTokens = useMemo(
        () => getCombinedSemanticTokens({
            slot: 'third_call',
            tagIds: activePeople.flatMap((person) => person.tagIds || []),
        }),
        [activePeople],
    );
    const secondColumnHeaderStyle = useMemo(() => ({
        ...secondPoolTokens.stripeCss,
        backgroundColor: `rgb(${getTagThemeTokens(secondPoolTokens.baseTone).accentRgb} / 0.11)`,
    }), [secondPoolTokens]);
    const secondColumnBodyStyle = useMemo(() => ({
        ...secondPoolTokens.stripeCss,
        backgroundColor: `rgb(${getTagThemeTokens(secondPoolTokens.baseTone).accentRgb} / 0.07)`,
    }), [secondPoolTokens]);
    const thirdColumnHeaderStyle = useMemo(() => ({
        ...thirdPoolTokens.stripeCss,
        backgroundColor: `rgb(${getTagThemeTokens(thirdPoolTokens.baseTone).accentRgb} / 0.11)`,
    }), [thirdPoolTokens]);
    const thirdColumnBodyStyle = useMemo(() => ({
        ...thirdPoolTokens.stripeCss,
        backgroundColor: `rgb(${getTagThemeTokens(thirdPoolTokens.baseTone).accentRgb} / 0.07)`,
    }), [thirdPoolTokens]);
    const shiftSource = monthLocked ? (monthLock?.shifts || []) : shifts;
    const shiftsByDate = useMemo(() => buildShiftsByDateIndex(shiftSource), [shiftSource]);

    // Clear person highlight when navigating to a different month
    useEffect(() => {
        setHighlightedPersonId(null);
    }, [monthKey]);

    // Load state from server on mount
    useEffect(() => {
        apiFetch('/api/state')
            .then(r => r.json())
            .then(data => {
                const normalizedPeople: Person[] = (data.people || []).map((person: Person) => ({
                    ...person,
                    tagIds: normalizePersonTags(person.tagIds || [], data.schedulingConfig, { singleRuleGroup: true }),
                }));
                const hasLegacyRuleGroupData = (data.people || []).some((person: Person) => (
                    countRuleGroupTags(person.tagIds || [], data.schedulingConfig) > 1
                ));
                const scheduleState = useScheduleStore.getState();
                const hasPeopleInStore = (scheduleState.peopleByMonth['all'] || []).length > 0;
                const hasShiftsInStore = scheduleState.shifts.length > 0;
                const sourcePeople: Person[] = hasPeopleInStore
                    ? (scheduleState.peopleByMonth['all'] || [])
                    : normalizedPeople;
                const normalizedSourcePeople = sourcePeople.map((person) => ({
                    ...person,
                    tagIds: normalizePersonTags(person.tagIds || [], data.schedulingConfig, { singleRuleGroup: true }),
                }));
                if (!hasShiftsInStore) setShifts(data.shifts || []);
                setPeopleForMonth('all', normalizedSourcePeople);
                setManualHighlights(data.manualHighlights || []);
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
                    showToast('พบข้อมูลเก่าที่มีหลาย Rule Group Tag และระบบจัดให้อัตโนมัติแล้ว', true);
                    if (canMutate) {
                        apiFetch('/api/people', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(normalizedPeople),
                        }).catch(console.error);
                    }
                }
                highlightsLoadedRef.current = true;
            })
            .catch(console.error);

        apiFetch('/api/holidays')
            .then(r => r.json())
            .then(data => setHolidays(data.holidays || []))
            .catch(console.error);

        apiFetch('/api/roster/templates')
            .then(r => r.json())
            .then(data => setTemplates(data.templates || []))
            .catch(console.error);
    }, [canMutate, setHolidays, setPeopleForMonth, setSchedulingConfig, setShifts, setTags]);

    useEffect(() => {
        apiFetch(`/api/versions?monthKey=${monthKey}`)
            .then(r => r.json())
            .then(data => setVersions(data.versions || []))
            .catch(console.error);
    }, [monthKey, setVersions]);

    useEffect(() => {
        requestMonthLock('load')
            .then(async (r) => {
                const data = await r.json();
                setMonthLock(data.locked || null);
                if (data.locked) {
                    writeMonthLockFallback(monthKey, data.locked);
                    writeVersionSnapshotFallback(data.locked.versionId, data.locked.people || []);
                } else writeMonthLockFallback(monthKey, null);
            })
            .catch((err) => {
                console.error(err);
                const fallback = readMonthLockFallback(monthKey);
                setMonthLock(fallback);
            });
    }, [monthKey]);

    useEffect(() => {
        apiFetch(`/api/roster/month/${monthKey}`)
            .then(r => r.json())
            .then(data => setMonthRoster(data.roster || null))
            .catch(console.error);
    }, [monthKey]);

    useEffect(() => {
        if (!highlightsLoadedRef.current) return;
        const timeout = setTimeout(async () => {
            try {
                await ensureApiSuccess(await apiFetch('/api/highlights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        manualHighlights,
                        noonDays,
                    }),
                }));
            } catch (err) {
                handleMutationError(err, 'Failed to save highlights/noon days');
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [manualHighlights, noonDays]);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const apply = () => setIsMobileViewport(mq.matches);
        apply();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }
        // Safari fallback
        mq.addListener?.(apply);
        return () => mq.removeListener?.(apply);
    }, []);

    const getShiftsForDay = (date: Date): Shift[] => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return shiftsByDate.get(dateStr) || [];
    };

    const getPersonName = (personId: string): string => {
        if (monthLocked) {
            return monthLockPeopleById.get(personId)?.name || peopleById.get(personId)?.name || personId;
        }
        return peopleById.get(personId)?.name || personId;
    };

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const handleMutationError = (err: unknown, fallback = 'Error communicating with server') => {
        if (isPreviewReadonlyError(err)) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        const message = err instanceof Error && err.message ? err.message : fallback;
        showToast(message, false);
        console.error(err);
    };

    const normalizeShiftsForSave = (input: Shift[]): Shift[] => {
        const byDatePerson = new Map<string, Shift>();
        const locked: Shift[] = [];
        for (const shift of input) {
            if (!shift?.date || !shift?.level || !shift?.personId) continue;
            if (shift.personId === '__locked__') {
                locked.push(shift);
                continue;
            }
            byDatePerson.set(`${shift.date}|${shift.personId}`, shift);
        }

        const byDateLevel = new Map<string, Shift>();
        for (const shift of [...locked, ...Array.from(byDatePerson.values())]) {
            byDateLevel.set(`${shift.date}|${shift.level}`, shift);
        }
        return Array.from(byDateLevel.values()).sort((a, b) => {
            const dateCmp = a.date.localeCompare(b.date);
            if (dateCmp !== 0) return dateCmp;
            return a.level.localeCompare(b.level);
        });
    };

    const persistShiftsToServer = async (nextShifts: Shift[]) => {
        const normalized = normalizeShiftsForSave(nextShifts);
        await ensureApiSuccess(await apiFetch('/api/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalized),
        }));
    };

    const scheduleShiftAutosave = (nextShifts: Shift[], delayMs = 800) => {
        const normalized = normalizeShiftsForSave(nextShifts);
        setShifts(normalized);
        pendingShiftAutosaveRef.current = normalized;
        if (shiftAutosaveTimeoutRef.current) clearTimeout(shiftAutosaveTimeoutRef.current);
        shiftAutosaveTimeoutRef.current = setTimeout(async () => {
            const payload = pendingShiftAutosaveRef.current;
            if (!payload) return;
            try {
                await persistShiftsToServer(payload);
                pendingShiftAutosaveRef.current = null;
            } catch (err) {
                handleMutationError(err, 'Failed to save shifts');
            }
        }, delayMs);
    };

    const upsertDayLevelShift = (dateStr: string, level: string, personId: string) => {
        const nextShifts = shifts.filter((s) => {
            if (s.date !== dateStr) return true;
            if (s.level === level) return false;
            if (personId && personId !== '__locked__' && s.personId === personId && s.personId !== '__locked__') return false;
            return true;
        });
        if (personId) nextShifts.push({ date: dateStr, level: level as Shift['level'], personId });
        scheduleShiftAutosave(nextShifts);
    };

    const buildMobileDayPayload = (date: Date): DayEditorPayload => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayShifts = getShiftsForDay(date);
        const byLevel = new Map(dayShifts.map((s) => [s.level, s.personId]));
        const slotOptions = (slotTag: string) => sortedActivePeople
            .filter((p) => p.tagIds?.includes(slotTag))
            .map((p) => ({ value: p.id, label: p.name }));

        return {
            date: dateStr,
            displayDate: format(date, 'EEE, d MMM yyyy'),
            values: {
                '1A': byLevel.get('1A') || '',
                '1B': byLevel.get('1B') || '',
                '2': byLevel.get('2') || '',
                '3': byLevel.get('3') || '',
            },
            optionsBySlot: {
                '1A': slotOptions('first_call'),
                '1B': slotOptions('first_call'),
                '2': slotOptions('second_call'),
                '3': slotOptions('third_call'),
            },
        };
    };

    const saveShiftsImmediately = async (nextShifts: Shift[]) => {
        const normalized = normalizeShiftsForSave(nextShifts);
        if (shiftAutosaveTimeoutRef.current) clearTimeout(shiftAutosaveTimeoutRef.current);
        shiftAutosaveTimeoutRef.current = null;
        pendingShiftAutosaveRef.current = null;
        setShifts(normalized);
        await persistShiftsToServer(normalized);
    };

    const persistVersions = async (nextVersions: ScheduleVersion[]) => {
        setVersions(nextVersions);
        const res = await apiFetch('/api/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthKey, versions: nextVersions }),
        });
        await ensureApiSuccess(res);
    };

    const requestMonthLock = async (
        mode: 'load' | 'lock' | 'unlock',
        body?: Record<string, unknown>
    ): Promise<Response> => {
        const candidates =
            mode === 'load'
                ? [`/api/month-lock?monthKey=${monthKey}`, `/api/month-lock/${monthKey}`]
                : mode === 'lock'
                    ? [`/api/month-lock?monthKey=${monthKey}`, `/api/month-lock/${monthKey}`]
                    : [`/api/month-lock/${monthKey}/unlock`, `/api/month-lock/unlock?monthKey=${monthKey}`];
        for (const url of candidates) {
            const res = await apiFetch(url, {
                method: mode === 'load' ? 'GET' : 'POST',
                headers: mode === 'load' ? undefined : { 'Content-Type': 'application/json' },
                body: mode === 'load' ? undefined : JSON.stringify(body || {}),
            });
            if (res.status === 404) continue;
            await ensureApiSuccess(res);
            return res;
        }
        throw new Error('Month lock endpoint not found (404)');
    };

    const handleSaveVersion = async () => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        if (monthLocked) {
            showToast('Month is locked. Unlock in History before saving changes.', false);
            return;
        }
        const nextVersion: ScheduleVersion = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            month: monthKey,
            name: `Saved ${format(new Date(), 'MMM d, HH:mm')}`,
            shifts: shifts.filter(s => s.date.startsWith(monthKey)),
        };
        try {
            const nextVersions = [...versions, nextVersion];
            setVersions(nextVersions);
            await persistVersions(nextVersions);
            showToast('Schedule saved!', true);
        } catch (err) {
            setVersions(versions);
            handleMutationError(err, 'Failed to save version history');
        }
    };

    const handleDeleteVersion = async (versionId: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        try {
            await persistVersions(versions.filter(v => v.id !== versionId));
            showToast('Version deleted', true);
        } catch (err) {
            handleMutationError(err, 'Failed to delete version');
        }
    };

    const requestVersionRestore = async (versionId: string, options: { dryRun: boolean; conflictMode?: RestoreConflictMode }) => {
        const res = await apiFetch(`/api/versions/${versionId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                monthKey,
                dryRun: options.dryRun,
                conflictMode: options.conflictMode,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.error || 'Failed to restore version');
        }
        return data;
    };

    const applyVersionRestore = async (versionId: string, conflictMode: RestoreConflictMode) => {
        setRestoreLoading(true);
        try {
            const data = await requestVersionRestore(versionId, { dryRun: false, conflictMode });
            setPeopleForMonth('all', data.people || []);
            setShifts(data.shifts || []);
            setRestoreConflict(null);
            setRestoreResult(data.summary || null);
            showToast('Version restored', true);
        } finally {
            setRestoreLoading(false);
        }
    };

    const handleResolveRestoreConflict = async (mode: RestoreConflictMode) => {
        if (!restoreConflict) return;
        try {
            await applyVersionRestore(restoreConflict.versionId, mode);
        } catch (err) {
            handleMutationError(err, 'Failed to restore version');
        }
    };

    const handleRestoreVersion = async (versionId: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        if (monthLocked) {
            showToast('Month is locked. Unlock in History before restoring.', false);
            return;
        }
        try {
            setRestoreConflict(null);
            setRestoreResult(null);
            const dryRun = await requestVersionRestore(versionId, { dryRun: true });
            const conflicts: RestoreConflictEntry[] = dryRun.conflicts || [];
            if (dryRun.requiresConflictResolution && conflicts.length > 0) {
                setRestoreConflict({ versionId, conflicts });
                return;
            }
            await applyVersionRestore(versionId, 'skip');
        } catch (err) {
            handleMutationError(err, 'Failed to restore version');
        }
    };

    const handleLockVersion = async (versionId: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        try {
            const res = await requestMonthLock('lock', { versionId });
            const data = await res.json();
            setMonthLock(data.locked || null);
            writeMonthLockFallback(monthKey, data.locked || null);
            if (data.locked?.versionId) writeVersionSnapshotFallback(data.locked.versionId, data.locked.people || []);
            showToast('Month locked to selected version', true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('endpoint not found')) {
                const ver = versions.find(v => v.id === versionId);
                if (!ver) {
                    showToast('Version not found', false);
                    return;
                }
                const peopleSnapshot = readVersionSnapshotFallback(ver.id) || people.map((p) => ({ personId: p.id, name: p.name, color: p.color }));
                const localLock: MonthLockShape = {
                    versionId: ver.id,
                    shifts: ver.shifts,
                    people: peopleSnapshot,
                    lockedAt: Date.now(),
                };
                setMonthLock(localLock);
                writeMonthLockFallback(monthKey, localLock);
                writeVersionSnapshotFallback(ver.id, peopleSnapshot);
                showToast('Month locked (local fallback)', true);
                return;
            }
            handleMutationError(err, 'Failed to lock version');
        }
    };

    const handleRenameVersion = async (versionId: string, name: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        const nextName = name.trim();
        if (!nextName) {
            showToast('Version name cannot be empty', false);
            return;
        }
        const next = versions.map(v => (v.id === versionId ? { ...v, name: nextName } : v));
        try {
            await persistVersions(next);
            showToast('Version renamed', true);
        } catch (err) {
            handleMutationError(err, 'Failed to rename version');
        }
    };

    const handleUnlockMonth = async (code: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        const trimmedCode = code.trim();
        if (!trimmedCode) return;
        try {
            await requestMonthLock('unlock', { code: trimmedCode });
            setMonthLock(null);
            writeMonthLockFallback(monthKey, null);
            showToast('Month unlocked', true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('endpoint not found')) {
                setMonthLock(null);
                writeMonthLockFallback(monthKey, null);
                showToast('Month unlocked (local fallback)', true);
                return;
            }
            handleMutationError(err, 'Failed to unlock month');
        }
    };

    const buildMergedShifts = (generatedShifts: Shift[]): Shift[] => {
        const currentMonthShifts = shifts.filter(s => s.date.startsWith(monthKey));
        const lockedCoreKeys = new Set(
            currentMonthShifts
                .filter(s => CORE_LEVELS.has(s.level) && s.personId === '__locked__')
                .map(s => `${s.date}|${s.level}`)
        );
        const preservedMonthShifts = currentMonthShifts.filter(s => !CORE_LEVELS.has(s.level) || s.personId === '__locked__');
        const generatedFiltered = generatedShifts.filter(s => !lockedCoreKeys.has(`${s.date}|${s.level}`));
        return [
            ...shifts.filter(s => !s.date.startsWith(monthKey)),
            ...preservedMonthShifts,
            ...generatedFiltered,
        ];
    };

    const persistMergedShifts = async (mergedShifts: Shift[]) => {
        await saveShiftsImmediately(mergedShifts);
    };

    useEffect(() => () => {
        if (shiftAutosaveTimeoutRef.current) {
            clearTimeout(shiftAutosaveTimeoutRef.current);
            shiftAutosaveTimeoutRef.current = null;
        }
        const payload = pendingShiftAutosaveRef.current;
        if (!payload) return;
        apiFetch('/api/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => { });
        pendingShiftAutosaveRef.current = null;
    }, []);

    const handleGenerateClick = (mode: 'all' | '2nd3rd' = 'all') => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        if (monthLocked) {
            showToast('Month is locked. Unlock in History before generating.', false);
            return;
        }
        setShowGenDropdown(false);
        const has3rdCall = activePeople.some(p => p.tagIds?.includes('third_call'));
        if (!has3rdCall) setShowNo3rdCallModal(true);
        else generateSchedule(mode);
    };

    const generateSchedule = async (mode: 'all' | '2nd3rd' = 'all') => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        setIsGenerating(true);
        try {
            // Load cumulative weights from server DB so solver compensates for past deficits
            const cumulativeState = useCumulativeStore.getState();
            if (!cumulativeState.loaded) {
                const cumulativeRes = await apiFetch('/api/cumulative');
                if (cumulativeRes.ok) {
                    const cumulativePayload = await cumulativeRes.json();
                    cumulativeState.setData(cumulativePayload.data || {});
                }
            }
            const cumulativeWeights = useCumulativeStore.getState().getCumulativeWeights();
            const hasPriorityPack = !!activeInsightPack && Object.keys(activeInsightPack.weightAdjustments).length > 0;
            const effectiveCumulativeWeights = hasPriorityPack
                ? mergeCumulativeWeights(cumulativeWeights, activeInsightPack.weightAdjustments)
                : cumulativeWeights;

            // Build existingShifts from manually-placed shifts so solver preserves them
            const existingShiftsMap: Record<number, { f1: string; f2: string; sec: string; thi: string | null }> = {};
            const currentMonthShifts = shifts.filter(s => s.date.startsWith(monthKey));
            for (const s of currentMonthShifts) {
                const day = parseInt(s.date.split('-')[2], 10);
                if (!existingShiftsMap[day]) existingShiftsMap[day] = { f1: '', f2: '', sec: '', thi: null };
                if (s.level === '1A' && s.personId !== '__locked__') existingShiftsMap[day].f1 = s.personId;
                if (s.level === '1B' && s.personId !== '__locked__') existingShiftsMap[day].f2 = s.personId;
                if (s.level === '2' && s.personId !== '__locked__') existingShiftsMap[day].sec = s.personId;
                if (s.level === '3' && s.personId !== '__locked__') existingShiftsMap[day].thi = s.personId;
            }

            const res = await apiFetch('/api/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: currentDate.getFullYear(),
                    month: currentDate.getMonth() + 1,
                    mode,
                    cumulativeWeights: effectiveCumulativeWeights,
                    existingShifts: existingShiftsMap,
                    existingShiftRows: currentMonthShifts,
                }),
            });
            await ensureApiSuccess(res);

            const result = await res.json();
            setLastSolveMeta({
                configVersion: result?.meta?.configVersion,
                compileWarnings: result?.meta?.compileWarnings || [],
                insightPackApplied: hasPriorityPack,
                insightPackSize: hasPriorityPack ? Object.keys(activeInsightPack?.weightAdjustments || {}).length : 0,
            });
            if (hasPriorityPack) clearInsightPriorityPackForMonth(monthKey);

            const mergedShifts = buildMergedShifts(result.shifts || []);
            const hardViolationCount = Array.isArray(result.violations)
                ? result.violations.filter((v: Violation) => v.sev === 'hard').length
                : 0;
            if (result.needsHardViolationConfirm && hardViolationCount > 0) {
                setPendingMergedShifts(mergedShifts);
                setPendingHardViolationCount(hardViolationCount);
                setShowHardViolationConfirmModal(true);
                showToast(`Generated with ${hardViolationCount} hard violation(s)`, false);
            } else {
                await persistMergedShifts(mergedShifts);
                showToast(
                    hasPriorityPack
                        ? 'Schedule generated with Priority Pack.'
                        : 'Schedule generated - no violations!',
                    true,
                );
            }
        } catch (err) {
            handleMutationError(err, 'Failed to generate schedule');
        } finally {
            setIsGenerating(false);
        }
    };

    const setEligibility = async (personId: string, mode: 'include' | 'exclude' | 'template') => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
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
            setMonthRoster(data.roster || null);
            if (mode === 'exclude') {
                if (highlightedPersonId === personId) setHighlightedPersonId(null);
                if (offDayPersonId === personId) setOffDayPersonId(null);
                if (subsetPickerFor === personId) setSubsetPickerFor(null);
                if (eligibilityPickerFor === personId) setEligibilityPickerFor(null);
                if (tagEditorFor === personId) setTagEditorFor(null);
                const st = await apiFetch('/api/state');
                if (st.ok) {
                    const full = await st.json();
                    setShifts(full.shifts || []);
                }
            }
        } catch (err) {
            handleMutationError(err, 'Failed to update eligibility');
        }
    };

    const savePersonTags = async (personId: string, tagIds: string[]) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
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
            setPeopleForMonth('all', data.people || []);
        } catch (err) {
            handleMutationError(err, 'Failed to save tags');
        }
    };

    const updateSubsetTag = async (person: Person, subsetId: string | null) => {
        const nextTagIds = replaceSubsetTag(person.tagIds || [], subsetId, schedulingConfig);
        await savePersonTags(person.id, nextTagIds);
        setSubsetPickerFor(null);
    };

    const toggleAnyTag = async (person: Person, tagId: string) => {
        const tags = person.tagIds || [];
        const next = tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId];
        await savePersonTags(person.id, next);
    };

    const submitQuickAdd = async () => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        const trimmedName = quickAddDraft.name.trim();
        if (!trimmedName || quickAddDraft.callTagIds.length === 0 || !quickAddDraft.subsetId) {
            setQuickAddError('Please fill Name, Call Tag (เวรที่ลงได้), and Rule Group Tag (กลุ่มกติกา).');
            return;
        }
        setQuickAddSaving(true);
        setQuickAddError(null);
        try {
            const stateRes = await apiFetch('/api/state');
            await ensureApiSuccess(stateRes);
            const stateData = await stateRes.json();
            const latestPeople: Person[] = stateData.people || [];
            const normalizedName = trimmedName.toLocaleLowerCase('en-US');
            const hasDuplicateName = latestPeople.some((person) => person.name.trim().toLocaleLowerCase('en-US') === normalizedName);
            if (hasDuplicateName) {
                setQuickAddError(`"${trimmedName}" already exists.`);
                return;
            }
            const newPersonId = `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const newPerson: Person = {
                id: newPersonId,
                name: trimmedName,
                color: '#10b981',
                tagIds: [...quickAddDraft.callTagIds, quickAddDraft.subsetId],
                unavailableDates: [],
            };
            const nextPeople = [...latestPeople, newPerson];

            await ensureApiSuccess(await apiFetch('/api/people', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nextPeople),
            }));
            setPeopleForMonth('all', nextPeople);

            const includeRes = await apiFetch(`/api/people/${newPersonId}/month/${monthKey}/eligibility`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'include' }),
            });
            await ensureApiSuccess(includeRes);

            const rosterRes = await apiFetch(`/api/roster/month/${monthKey}`);
            if (rosterRes.ok) {
                const rosterData = await rosterRes.json();
                setMonthRoster(rosterData.roster || null);
            }

            setQuickAddDraft({ name: '', callTagIds: [], subsetId: '' });
            setQuickAddCallMenuOpen(false);
            setIsQuickAddOpen(false);
            showToast(`Added ${trimmedName}`, true);
        } catch (err) {
            handleMutationError(err, 'Failed to add person');
            setQuickAddError('Failed to add person. Please try again.');
        } finally {
            setQuickAddSaving(false);
        }
    };

    const requestDeletePreview = async (person: Person) => {
        try {
            const res = await apiFetch(`/api/people/${person.id}?preview=1&monthKey=${monthKey}`, { method: 'DELETE' });
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
        } catch (err) {
            handleMutationError(err, 'Failed to preview delete');
        }
    };

    const confirmSoftDelete = async () => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        if (!deletePreview) return;
        try {
            const res = await apiFetch(`/api/people/${deletePreview.person.id}?monthKey=${monthKey}`, { method: 'DELETE' });
            await ensureApiSuccess(res);
            const data = await res.json();
            setPeopleForMonth('all', data.people || []);
            setShifts(data.shifts || []);
            if (offDayPersonId === deletePreview.person.id) setOffDayPersonId(null);
            if (highlightedPersonId === deletePreview.person.id) setHighlightedPersonId(null);
            setDeletePreview(null);
            showToast('Moved to Deleted Folder', true);
        } catch (err) {
            handleMutationError(err, 'Failed to delete person');
        }
    };

    const togglePersonOffDay = async (dateStr: string) => {
        if (!canMutate) {
            showToast(PREVIEW_READONLY_MESSAGE, false);
            return;
        }
        if (!offDayPersonId) return;
        const person = peopleById.get(offDayPersonId);
        if (!person) return;
        const dates = person.unavailableDates || [];
        const unavailableDates = dates.includes(dateStr)
            ? dates.filter(d => d !== dateStr)
            : [...dates, dateStr].sort();

        try {
            const res = await apiFetch(`/api/people/${offDayPersonId}/offdays`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unavailableDates }),
            });
            await ensureApiSuccess(res);
            const data = await res.json();
            setPeopleForMonth('all', data.people || []);
        } catch (err) {
            handleMutationError(err, 'Failed to update off days');
        }
    };

    const togglePanelGroup = (key: string) => {
        setPanelCollapsed(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const exportPDF = () => {
        /* ── Theme-aware PDF palette ───────────────────────────────── */
        const currentTheme = useThemeStore.getState().themeId;
        const palettes: Record<string, {
            pageBg: string; pageBorder: string; heroTitle: string;
            badgeBg: string; badgeText: string; badgeBorder: string;
            weekdayBg: string; weekdayText: string;
            holidayCellBg: string; holidayPillBg: string; holidayPillText: string; holidayPillBorder: string;
            sectionTitle: string; thBg: string; thText: string; thBorder: string;
            groupBg: string; groupText: string; holidayRowBg: string;
            totalCol: string; bodyBg: string;
        }> = {
            'classic-5-1': {
                pageBg: 'linear-gradient(150deg, #f9fdfb 0%, #f0faf4 50%, #edf7f1 100%)',
                pageBorder: '#d1e7dd', heroTitle: '#047857',
                badgeBg: '#ecfdf5', badgeText: '#065f46', badgeBorder: '#a7f3d0',
                weekdayBg: '#ecfdf5', weekdayText: '#065f46',
                holidayCellBg: 'linear-gradient(180deg, #ecfdf5, #d1fae5)',
                holidayPillBg: '#d1fae5', holidayPillText: '#047857', holidayPillBorder: '#6ee7b7',
                sectionTitle: '#047857', thBg: '#ecfdf5', thText: '#065f46', thBorder: '#a7f3d0',
                groupBg: '#ecfdf5', groupText: '#047857', holidayRowBg: '#ecfdf5',
                totalCol: '#047857', bodyBg: '#f9fdfb',
            },
            'cool-slate': {
                pageBg: 'linear-gradient(150deg, #f8fafc 0%, #f0f4f8 50%, #e8eef5 100%)',
                pageBorder: '#cbd5e1', heroTitle: '#1e40af',
                badgeBg: '#eff6ff', badgeText: '#1e3a8a', badgeBorder: '#93c5fd',
                weekdayBg: '#eff6ff', weekdayText: '#1e3a8a',
                holidayCellBg: 'linear-gradient(180deg, #eff6ff, #dbeafe)',
                holidayPillBg: '#dbeafe', holidayPillText: '#1d4ed8', holidayPillBorder: '#93c5fd',
                sectionTitle: '#1e40af', thBg: '#eff6ff', thText: '#1e3a8a', thBorder: '#93c5fd',
                groupBg: '#eff6ff', groupText: '#1e40af', holidayRowBg: '#eff6ff',
                totalCol: '#1d4ed8', bodyBg: '#f8fafc',
            },
            'warm-paper': {
                pageBg: 'linear-gradient(150deg, #fffcf7 0%, #fef7ed 50%, #fdf2e4 100%)',
                pageBorder: '#e7d5c0', heroTitle: '#92400e',
                badgeBg: '#fffbeb', badgeText: '#78350f', badgeBorder: '#fcd34d',
                weekdayBg: '#fffbeb', weekdayText: '#78350f',
                holidayCellBg: 'linear-gradient(180deg, #fef3c7, #fde68a)',
                holidayPillBg: '#fef3c7', holidayPillText: '#92400e', holidayPillBorder: '#fcd34d',
                sectionTitle: '#92400e', thBg: '#fffbeb', thText: '#78350f', thBorder: '#fcd34d',
                groupBg: '#fffbeb', groupText: '#92400e', holidayRowBg: '#fef9c3',
                totalCol: '#b45309', bodyBg: '#fffcf7',
            },
            'forest-dusk': {
                pageBg: 'linear-gradient(150deg, #f0faf4 0%, #eaf5ef 50%, #e0f0e8 100%)',
                pageBorder: '#a7d4bc', heroTitle: '#14532d',
                badgeBg: '#dcfce7', badgeText: '#14532d', badgeBorder: '#86efac',
                weekdayBg: '#dcfce7', weekdayText: '#14532d',
                holidayCellBg: 'linear-gradient(180deg, #dcfce7, #bbf7d0)',
                holidayPillBg: '#bbf7d0', holidayPillText: '#166534', holidayPillBorder: '#86efac',
                sectionTitle: '#14532d', thBg: '#dcfce7', thText: '#14532d', thBorder: '#86efac',
                groupBg: '#dcfce7', groupText: '#14532d', holidayRowBg: '#dcfce7',
                totalCol: '#15803d', bodyBg: '#f0faf4',
            },
            'midnight': {
                pageBg: 'linear-gradient(150deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
                pageBorder: '#94a3b8', heroTitle: '#334155',
                badgeBg: '#f1f5f9', badgeText: '#334155', badgeBorder: '#94a3b8',
                weekdayBg: '#f1f5f9', weekdayText: '#334155',
                holidayCellBg: 'linear-gradient(180deg, #f1f5f9, #e2e8f0)',
                holidayPillBg: '#e2e8f0', holidayPillText: '#475569', holidayPillBorder: '#94a3b8',
                sectionTitle: '#334155', thBg: '#f1f5f9', thText: '#334155', thBorder: '#94a3b8',
                groupBg: '#f1f5f9', groupText: '#334155', holidayRowBg: '#f1f5f9',
                totalCol: '#475569', bodyBg: '#f8fafc',
            },
        };
        const pal = palettes[currentTheme] || palettes['classic-5-1'];

        const firstCallLevels = Array.from({ length: firstCallCount }).map((_, i) => `1${String.fromCharCode(65 + i)}`);
        const allLevels = [...firstCallLevels, '2', '3'];
        const levelLabels: Record<string, string> = Object.fromEntries([
            ...firstCallLevels.map((lv, i) => [lv, `1st-${String.fromCharCode(65 + i)}`]),
            ['2', '2nd'],
            ['3', '3rd'],
        ]);
        const levelClass: Record<string, string> = {
            '2': 'slot second',
            '3': 'slot third',
        };
        for (let i = 0; i < firstCallLevels.length; i += 1) {
            const lv = firstCallLevels[i];
            levelClass[lv] = i % 2 === 0 ? 'slot first-a' : 'slot first-b';
        }
        const chunks: Date[][] = [];
        for (let i = 0; i < calendarDays.length; i += 7) {
            chunks.push(calendarDays.slice(i, i + 7));
        }
        const monthOnlyDays = calendarDays.filter(d => isSameMonth(d, monthStart));
        const dayCards = chunks.map(week => `
            <div class="week-row">
              ${week.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, monthStart);
            const holiday = holidays.find(h => h.date === dateStr);
            const dayShifts = getShiftsForDay(day);
            const shiftByLevel = new Map<string, Shift>(dayShifts.map(s => [s.level, s]));
            const shiftLines = allLevels
                .map(level => {
                    const shift = shiftByLevel.get(level);
                    if (!shift || shift.personId === '__locked__') return '';
                    const name = escapeHtml(getPersonName(shift.personId));
                    return `<div class="${levelClass[level] || 'slot'}"><span class="slot-label">${levelLabels[level] || level}</span><span class="slot-name">${name}</span></div>`;
                })
                .filter(Boolean)
                .join('');
            const dayClass = [
                'day-cell',
                inMonth ? 'in-month' : 'out-month',
                isToday(day) ? 'today-cell' : '',
                (holiday || isWeekend(day)) && inMonth ? 'holiday-cell' : '',
            ].join(' ');
            return `
                    <div class="${dayClass}">
                      <div class="day-head">
                        <span class="day-num">${format(day, 'd')}</span>
                        ${holiday ? `<span class="holiday-pill">${escapeHtml(holiday.name)}</span>` : ''}
                      </div>
                      <div class="day-slots">${shiftLines}</div>
                    </div>
                `;
        }).join('')}
            </div>
        `).join('');
        const excelHeaders = [...firstCallLevels.map((_, i) => `1st-${String.fromCharCode(65 + i)}`), '2nd', '3rd'];
        const excelRows = monthOnlyDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayShifts = getShiftsForDay(day);
            const shiftByLevel = new Map<string, Shift>(dayShifts.map(s => [s.level, s]));
            const holiday = holidays.find(h => h.date === dateStr);
            const isHolidayRow = !!holiday || isWeekend(day);
            const dateLabel = `${format(day, 'EEE')} ${format(day, 'd MMM')}`;
            const values = allLevels.map(level => {
                const shift = shiftByLevel.get(level);
                if (!shift || shift.personId === '__locked__') return '-';
                return escapeHtml(getPersonName(shift.personId));
            });
            return `
                <tr class="${isHolidayRow ? 'holiday-row' : ''}">
                  <td class="date-col">
                    <div>${escapeHtml(dateLabel)}${holiday ? `<span class="holiday-mini"> " ${escapeHtml(holiday.name)}</span>` : ''}</div>
                  </td>
                  ${values.map(v => `<td>${v}</td>`).join('')}
                </tr>
            `;
        }).join('');
        const subsetBuckets = new Map<string, Person[]>();
        const subsetOrder = subsetOptions.map(opt => opt.labelEnTh);
        for (const person of sortedActivePeople) {
            const subsetLabel = getSubsetDisplay(person.tagIds || [], schedulingConfig)?.labelEnTh || 'Other';
            if (!subsetBuckets.has(subsetLabel)) subsetBuckets.set(subsetLabel, []);
            subsetBuckets.get(subsetLabel)!.push(person);
        }
        const orderedSubsetLabels = Array.from(subsetBuckets.keys()).sort((a, b) => {
            const ia = subsetOrder.indexOf(a);
            const ib = subsetOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b, undefined, { sensitivity: 'base' });
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        const summaryRows = orderedSubsetLabels
            .map(label => {
                const persons = subsetBuckets.get(label) || [];
                const personRows = persons.map((person) => {
                    const summary = monthSummary[person.id];
                    return `
                        <tr>
                          <td class="name-col">${escapeHtml(person.name)}</td>
                          <td>${summary?.firstCount || 0}</td>
                          <td>${summary?.secondCount || 0}</td>
                          <td>${summary?.thirdCount || 0}</td>
                          <td>${summary?.noonCount || 0}</td>
                          <td>${summary?.weekday || 0}</td>
                          <td>${summary?.holiday || 0}</td>
                          <td class="total-col">${summary?.total || 0}</td>
                        </tr>
                    `;
                }).join('');
                return `
                    <tr class="group-row"><td colspan="8">Group: ${escapeHtml(label)} (${persons.length})</td></tr>
                    ${personRows}
                `;
            })
            .join('');
        const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Wayne Schedule ${escapeHtml(monthKey)}</title>
  <style>
    @page { size: A4 portrait; margin: 7mm; }
    @page calendarPage { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "LINE Seed Sans TH", "Segoe UI", "Arial", sans-serif;
      color: #0f172a;
      background: ${pal.bodyBg};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      min-height: calc(297mm - 20mm);
      padding: 6mm;
      border-radius: 14px;
      background: ${pal.pageBg};
      border: 1px solid ${pal.pageBorder};
      break-after: page;
      position: relative;
      overflow: hidden;
    }
    .page:last-child { break-after: auto; }
    .page-calendar {
      page: calendarPage;
      min-height: 0;
      height: calc(210mm - 12mm);
      padding: 4mm;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      gap: 12px;
    }
    .hero h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.02em;
      color: ${pal.heroTitle};
    }
    .hero .meta {
      margin-top: 4px;
      font-size: 12px;
      color: #475569;
    }
    .hero .badge {
      background: ${pal.badgeBg};
      color: ${pal.badgeText};
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      border: 1px solid ${pal.badgeBorder};
      white-space: nowrap;
    }
    .weekday-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 3px;
    }
    .weekday-header div {
      text-align: center;
      padding: 6px 0;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: ${pal.weekdayText};
      background: ${pal.weekdayBg};
      border-radius: 8px;
    }
    .week-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
      margin-bottom: 3px;
    }
    .day-cell {
      border-radius: 10px;
      padding: 4px;
      min-height: 0;
      border: 1px solid #e2e8f0;
      background: #fff;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .calendar-weeks {
      display: grid;
      gap: 2px;
      grid-template-rows: repeat(var(--week-count), 1fr);
      flex: 1 1 auto;
      min-height: 0;
    }
    .calendar-weeks .week-row {
      margin-bottom: 0;
      min-height: 0;
    }
    .calendar-weeks .day-cell {
      min-height: 0;
      height: 100%;
    }
    .day-cell.out-month { opacity: .45; background: #f8fafc; }
    .day-cell.today-cell { border: 2px solid #2563eb; }
    .day-cell.holiday-cell { background: ${pal.holidayRowBg}; }
    .day-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      gap: 6px;
    }
    .day-num { font-size: 13px; font-weight: 800; color: #0f172a; }
    .holiday-pill {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 99px;
      background: ${pal.holidayPillBg};
      color: ${pal.holidayPillText};
      border: 1px solid ${pal.holidayPillBorder};
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .day-slots {
      display: grid;
      gap: 3px;
      margin-top: 2px;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      align-content: start;
    }
    .slot {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      border-radius: 7px;
      padding: 1px 4px;
      font-size: 9px;
      font-weight: 700;
      border: 1px solid transparent;
      line-height: 1.2;
      align-items: center;
    }
    .slot-label { color: #475569; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; flex: 0 0 auto; }
    .slot-name {
      flex: 1 1 auto;
      min-width: 0;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .slot.first-a { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .slot.first-b { background: #f0fdfa; border-color: #99f6e4; color: #0f766e; }
    .slot.second { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .slot.third { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
    .slot.empty { color: #94a3b8; background: #f8fafc; border-color: #e2e8f0; justify-content: center; font-weight: 600; }
    .section-title {
      margin: 0 0 10px 0;
      font-size: 20px;
      letter-spacing: .03em;
      color: ${pal.sectionTitle};
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border-radius: 12px;
      overflow: hidden;
      font-size: 11px;
      background: #fff;
      border: 1px solid ${pal.thBorder};
    }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 8px 7px;
      text-align: center;
      vertical-align: middle;
    }
    th {
      background: ${pal.thBg};
      color: ${pal.thText};
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      font-weight: 800;
    }
    td.date-col, td.name-col { text-align: left; font-weight: 700; color: #0f172a; }
    .holiday-mini { font-size: 9px; color: #16a34a; margin-top: 3px; font-weight: 700; }
    .total-col { font-weight: 900; color: ${pal.totalCol}; }
    .foot-note {
      margin-top: 10px;
      font-size: 10px;
      color: #64748b;
    }
    .page-excel {
      page: auto;
      min-height: 0;
      height: calc(297mm - 20mm);
      padding: 4mm;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    }
    .page-excel .hero {
      margin-bottom: 4px;
    }
    .page-excel .hero h1 {
      font-size: 18px;
    }
    .page-excel .hero .meta {
      font-size: 9px;
    }
    .page-excel table {
      table-layout: fixed;
      font-size: 9px;
      flex: 1 1 auto;
      min-height: 0;
    }
    .page-excel th, .page-excel td {
      padding: 3px 4px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .page-excel th {
      font-size: 8px;
    }
    .page-excel td.date-col {
      width: 110px;
    }
    .page-excel .holiday-mini {
      display: inline;
      margin-top: 0;
      font-size: 8px;
    }
    .page-excel .holiday-row td {
      background: ${pal.holidayRowBg};
    }
    .group-row td {
      text-align: left;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
      font-size: 10px;
      color: ${pal.groupText};
      background: ${pal.groupBg};
    }
  </style>
</head>
<body>
  <section class="page page-calendar">
    <div class="hero">
      <div>
        <h1>Wayne Monthly Calendar</h1>
        <div class="meta">${escapeHtml(format(monthStart, 'MMMM yyyy'))} | Generated ${escapeHtml(format(new Date(), 'yyyy-MM-dd HH:mm'))}</div>
      </div>
      <div class="badge">Visual Calendar</div>
    </div>
    <div class="weekday-header">
      <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
    </div>
    <div class="calendar-weeks" style="--week-count:${chunks.length};">
      ${dayCards}
    </div>
    <div class="foot-note">Color key: green = 1st call, amber = 2nd call, blue = 3rd call.</div>
  </section>

  <section class="page page-excel">
    <div class="hero">
      <div>
        <h1>Wayne Excel View</h1>
        <div class="meta">${escapeHtml(format(monthStart, 'MMMM yyyy'))} daily assignment matrix</div>
      </div>
      <div class="badge">Spreadsheet</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          ${excelHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${excelRows}
      </tbody>
    </table>
    <div class="foot-note">Tip: open this PDF in landscape viewer if you want wider columns on small screens.</div>
  </section>

  <section class="page page-summary">
    <div class="hero">
      <div>
        <h1>Wayne Team Summary</h1>
        <div class="meta">Monthly workload breakdown by person</div>
      </div>
      <div class="badge">Summary</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>1st</th>
          <th>2nd</th>
          <th>3rd</th>
          <th>Noon</th>
          <th>Weekday</th>
          <th>Holiday</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRows}
      </tbody>
    </table>
    <div class="foot-note">This page helps compare fairness and load balance at a glance.</div>
  </section>
</body>
</html>
        `;
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.setAttribute('aria-hidden', 'true');
        frame.srcdoc = html;

        const cleanup = () => {
            window.setTimeout(() => {
                if (frame.parentNode) frame.parentNode.removeChild(frame);
            }, 800);
        };

        frame.onload = () => {
            const win = frame.contentWindow;
            if (!win) {
                cleanup();
                showToast('Unable to open PDF preview frame.', false);
                return;
            }
            window.setTimeout(() => {
                win.focus();
                win.print();
                cleanup();
            }, 350);
        };

        document.body.appendChild(frame);
    };

    const monthShifts = useMemo(
        () => monthLocked ? (monthLock?.shifts || []) : shifts.filter(s => s.date.startsWith(monthKey)),
        [monthLocked, monthLock, shifts, monthKey],
    );
    const monthShiftsByPerson = useMemo(() => buildMonthShiftsByPersonIndex(monthShifts), [monthShifts]);
    const toolbarChipBase = 'ui-btn relative z-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium leading-none transition-colors disabled:cursor-not-allowed';
    const getToolbarChipClass = (tone: ToolbarTone, extra = '') => {
        const toneClass = tone === 'accent'
            ? 'ui-btn-accent'
            : tone === 'success'
                ? 'ui-btn-success'
                : tone === 'warning'
                    ? 'ui-btn-warning'
                    : tone === 'danger'
                        ? 'ui-btn-danger'
                        : tone === 'info'
                            ? 'ui-btn-info'
                            : 'ui-btn-neutral';
        return `${toolbarChipBase} ${toneClass} ${extra}`.trim();
    };

    // Close month picker on outside click
    useEffect(() => {
        if (!showMonthPicker) return;
        const handler = (e: MouseEvent) => {
            if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
                setShowMonthPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMonthPicker]);

    useEffect(() => {
        registerGsapPlugins();
        return withGsapContext(toolbarRef.current, () => {
            const toolbar = toolbarRef.current;
            if (!toolbar) return;
            const actions = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-toolbar-action]'));
            if (actions.length === 0 || !canAnimate(motionTier)) return;
            gsap.set(actions, { autoAlpha: 0, y: -8, scale: 0.985 });
            gsap.to(actions, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                stagger: 0.035,
                ...getGsapVars(motionTier, 'banner'),
            });
        });
    }, [motionTier]);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const toolbar = toolbarRef.current;
        if (!toolbar || !canAnimate(motionTier)) return;
        const actions = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-toolbar-action]'));
        if (actions.length === 0) return;

        const onEnter = (event: Event) => {
            const target = event.currentTarget as HTMLElement;
            gsap.to(target, { y: -1.5, scale: 1.01, duration: 0.24, ease: 'power2.out' });
        };
        const onLeave = (event: Event) => {
            const target = event.currentTarget as HTMLElement;
            gsap.to(target, { y: 0, scale: 1, duration: 0.24, ease: 'power2.out' });
        };
        const onDown = (event: Event) => {
            const target = event.currentTarget as HTMLElement;
            gsap.to(target, { scale: 0.985, duration: 0.14, ease: 'power2.out' });
        };
        const onUp = (event: Event) => {
            const target = event.currentTarget as HTMLElement;
            gsap.to(target, { scale: 1.01, duration: 0.18, ease: 'power2.out' });
        };
        const onBlur = (event: Event) => {
            const target = event.currentTarget as HTMLElement;
            gsap.to(target, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
        };

        actions.forEach((action) => {
            action.addEventListener('mouseenter', onEnter);
            action.addEventListener('mouseleave', onLeave);
            action.addEventListener('mousedown', onDown);
            action.addEventListener('mouseup', onUp);
            action.addEventListener('focus', onEnter);
            action.addEventListener('blur', onBlur);
        });

        return () => {
            actions.forEach((action) => {
                action.removeEventListener('mouseenter', onEnter);
                action.removeEventListener('mouseleave', onLeave);
                action.removeEventListener('mousedown', onDown);
                action.removeEventListener('mouseup', onUp);
                action.removeEventListener('focus', onEnter);
                action.removeEventListener('blur', onBlur);
            });
            gsap.killTweensOf(actions);
        };
    }, [motionTier]);

    useEffect(() => {
        if (!showGenDropdown) return;
        registerGsapPlugins();
        return withGsapContext(genDropdownRef.current, () => {
            const panel = genDropdownRef.current;
            if (!panel) return;
            const options = Array.from(panel.querySelectorAll<HTMLElement>('[data-toolbar-option]'));
            if (!canAnimate(motionTier)) return;

            gsap.fromTo(panel,
                { autoAlpha: 0, y: -6, scale: 0.98 },
                { autoAlpha: 1, y: 0, scale: 1, ...getGsapVars(motionTier, 'modal') },
            );
            if (options.length === 0) return;
            gsap.fromTo(options,
                { autoAlpha: 0, x: 4 },
                { autoAlpha: 1, x: 0, duration: 0.22, ease: 'power2.out', stagger: 0.03, delay: 0.04 },
            );

            const onEnter = (event: Event) => gsap.to(event.currentTarget as HTMLElement, { y: -1, scale: 1.005, duration: 0.16, ease: 'power2.out' });
            const onLeave = (event: Event) => gsap.to(event.currentTarget as HTMLElement, { y: 0, scale: 1, duration: 0.16, ease: 'power2.out' });
            const onDown = (event: Event) => gsap.to(event.currentTarget as HTMLElement, { scale: 0.99, duration: 0.12, ease: 'power2.out' });
            const onUp = (event: Event) => gsap.to(event.currentTarget as HTMLElement, { scale: 1, duration: 0.12, ease: 'power2.out' });

            options.forEach((option) => {
                option.addEventListener('mouseenter', onEnter);
                option.addEventListener('mouseleave', onLeave);
                option.addEventListener('focus', onEnter);
                option.addEventListener('blur', onLeave);
                option.addEventListener('mousedown', onDown);
                option.addEventListener('mouseup', onUp);
            });

            return () => {
                options.forEach((option) => {
                    option.removeEventListener('mouseenter', onEnter);
                    option.removeEventListener('mouseleave', onLeave);
                    option.removeEventListener('focus', onEnter);
                    option.removeEventListener('blur', onLeave);
                    option.removeEventListener('mousedown', onDown);
                    option.removeEventListener('mouseup', onUp);
                });
                gsap.killTweensOf(options);
            };
        });
    }, [showGenDropdown, motionTier]);

    useEffect(() => {
        if (!showClearMonthConfirm) return;
        registerGsapPlugins();
        return withGsapContext(clearModalRef.current, () => {
            const card = clearModalRef.current;
            if (!card || !canAnimate(motionTier)) return;
            const badge = card.querySelector<HTMLElement>('[data-clear-modal-badge]');
            gsap.fromTo(card,
                { autoAlpha: 0, y: 10, scale: 0.96 },
                { autoAlpha: 1, y: 0, scale: 1, ...getGsapVars(motionTier, 'modal') },
            );
            if (!badge) return;
            gsap.fromTo(badge,
                { autoAlpha: 0, y: 6, scale: 0.9 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', delay: 0.06 },
            );
        });
    }, [showClearMonthConfirm, motionTier]);

    useEffect(() => {
        if (!isGenerating) return;
        registerGsapPlugins();
        return withGsapContext(loadingPopupRef.current, () => {
            const popup = loadingPopupRef.current;
            if (!popup || !canAnimate(motionTier)) return;
            const badge = popup.querySelector<HTMLElement>('[data-loading-badge]');
            const title = popup.querySelector<HTMLElement>('[data-loading-title]');
            const subtitle = popup.querySelector<HTMLElement>('[data-loading-subtitle]');
            const particles = Array.from(popup.querySelectorAll<HTMLElement>('[data-loading-orb]'));

            const timeline = gsap.timeline();
            if (badge) {
                timeline.fromTo(
                    badge,
                    { autoAlpha: 0, y: 8, scale: 0.92 },
                    { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, ease: 'power3.out' },
                );
            }
            if (title) {
                timeline.fromTo(
                    title,
                    { autoAlpha: 0, y: 6 },
                    { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power2.out' },
                    '-=0.1',
                );
            }
            if (subtitle) {
                timeline.fromTo(
                    subtitle,
                    { autoAlpha: 0, y: 4 },
                    { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' },
                    '-=0.08',
                );
            }
            if (particles.length > 0) {
                gsap.to(particles, {
                    y: -4,
                    autoAlpha: 0.58,
                    scale: 1.05,
                    duration: 1.2,
                    ease: 'sine.inOut',
                    repeat: -1,
                    yoyo: true,
                    stagger: 0.12,
                });
            }
        });
    }, [isGenerating, motionTier]);

    useEffect(() => {
        const panel = personPanelRef.current;
        const calendarPane = calendarPaneRef.current;
        if (!panel || !calendarPane) return;
        const prev = prevShowPersonPanelRef.current;
        if (prev === showPersonPanel) {
            panel.style.width = showPersonPanel ? `${panelWidthPx}px` : '0px';
            panel.style.opacity = showPersonPanel ? '1' : '0';
            panel.style.pointerEvents = showPersonPanel ? 'auto' : 'none';
            return;
        }
        prevShowPersonPanelRef.current = showPersonPanel;

        if (!canAnimate(motionTier)) {
            panel.style.width = showPersonPanel ? `${panelWidthPx}px` : '0px';
            panel.style.opacity = showPersonPanel ? '1' : '0';
            panel.style.pointerEvents = showPersonPanel ? 'auto' : 'none';
            panel.style.overflow = 'hidden';
            return;
        }

        setLayoutAnimating(true);
        gsap.killTweensOf([panel, calendarPane]);
        if (showPersonPanel) {
            panel.style.pointerEvents = 'none';
            panel.style.overflow = 'hidden';
            gsap.fromTo(panel,
                { width: 0, opacity: 0 },
                {
                    width: panelWidthPx,
                    opacity: 1,
                    duration: 0.3,
                    ease: 'power2.out',
                    onComplete: () => {
                        panel.style.pointerEvents = 'auto';
                        panel.style.overflow = 'hidden';
                        setLayoutAnimating(false);
                    },
                });
            gsap.fromTo(calendarPane, { x: 10 }, { x: 0, duration: 0.3, ease: 'power2.out' });
            return;
        }

        panel.style.pointerEvents = 'none';
        panel.style.overflow = 'hidden';
        gsap.to(panel, {
            width: 0,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.out',
            onComplete: () => {
                panel.style.overflow = 'hidden';
                setLayoutAnimating(false);
            },
        });
        gsap.fromTo(calendarPane, { x: 0 }, { x: 10, duration: 0.15, ease: 'power2.out', yoyo: true, repeat: 1 });
    }, [showPersonPanel, motionTier, panelWidthPx]);

    // Compute violations instantly on the frontend - no network call needed
    const violations = useMemo((): Violation[] => {
        const vio: Violation[] = [];
        // Build a map: day -> list of personIds assigned that day
        const byDay: Record<number, string[]> = {};
        for (const s of monthShifts) {
            if (!s.personId || s.personId === '__locked__') continue;
            const day = parseInt(s.date.split('-')[2], 10);
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(s.personId);
        }
        const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
        for (const d of days) {
            const pIds = byDay[d];
            // Consecutive (d, d+1) - hard
            for (const id of pIds) {
                if (byDay[d + 1]?.includes(id)) {
                    const pName = peopleById.get(id)?.name || id;
                    vio.push({ sev: 'hard', day: [d, d + 1], msg: `${pName} มีเวรติดกัน (วันนี้ ${d} และพรุ่งนี้ ${d + 1})` });
                }
            }
            // Every other day (d, d+2) - soft
            for (const id of pIds) {
                if (byDay[d + 2]?.includes(id)) {
                    const pName = peopleById.get(id)?.name || id;
                    vio.push({ sev: 'soft', day: [d, d + 2], msg: `${pName} มีเวรวันเว้นวัน (ช่วงวัน ${d}-${d + 2})` });
                }
            }
            // Off-day (person assigned on unavailable date) - hard
            for (const id of pIds) {
                const person = peopleById.get(id);
                const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
                if (person?.unavailableDates?.includes(dateStr)) {
                    vio.push({ sev: 'hard', day: d, msg: `${person.name} มี OFF แต่ถูกจัดเวร` });
                }
            }
        }
        return vio;
    }, [monthShifts, monthKey, peopleById]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ action?: string }>).detail;
            const action = detail?.action;
            if (!action) return;

            if (action === 'month-prev') setCurrentDate((d) => subMonths(d, 1));
            if (action === 'month-next') setCurrentDate((d) => addMonths(d, 1));
            if (action === 'today') setCurrentDate(new Date());
            if (action === 'history') setShowHistoryModal(true);
            if (action === 'import' && isEditor && canMutate && !monthLocked) setShowSmartImport(true);
            if (action === 'solve' && isEditor && canMutate && !monthLocked) handleGenerateClick('all');
            if (action === 'view') setViewMode(viewMode === 'calendar' ? 'excel' : 'calendar');
        };

        window.addEventListener('wayne:mobile-action', handler as EventListener);
        return () => window.removeEventListener('wayne:mobile-action', handler as EventListener);
    }, [canMutate, isEditor, monthLocked, setViewMode, viewMode]);

    return (
        <div ref={rootRef} className="ui-page-root flex flex-col h-full" style={{ background: pageGradient.background }}>
            {/* Header */}
            <header className={`ui-page-header px-4 sm:px-6 py-4 sticky top-0 z-20 flex items-center justify-between flex-wrap gap-3 ${isMobileV2 ? 'hidden md:flex' : ''}`}>
                {/* Left: clickable month/year -> custom month picker */}
                <div className="flex items-center gap-3 relative" ref={monthPickerRef}>
                    <button
                        onClick={() => { setShowMonthPicker(p => !p); setPickerYear(currentDate.getFullYear()); }}
                        className={`ui-btn p-2 rounded-xl transition-colors ${showMonthPicker ? 'ui-btn-success' : 'ui-btn-neutral'}`}
                        title="Jump to month"
                    >
                        <CalendarIcon className="w-5 h-5" />
                    </button>
                    <div className="text-left">
                        <h2 className="text-xl caps-title leading-tight">{format(currentDate, 'MMMM yyyy')}</h2>
                        <p className="text-[10px] text-gray-400 caps-micro">Year {currentDate.getFullYear() + 543} BE</p>
                    </div>

                    {/* Custom month/year picker popup */}
                    {showMonthPicker && (
                        <GsapPresence preset="banner" className="ui-panel-raised absolute left-0 top-full mt-2 z-50 rounded-2xl p-4 w-64">
                            {/* Year navigation */}
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                                <button
                                    onClick={() => setPickerYear(y => y - 1)}
                                    className="ui-btn ui-btn-neutral p-1.5 rounded-xl transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="text-center">
                                    <div className="text-sm text-gray-800 font-semibold">{pickerYear}</div>
                                    <div className="text-[10px] text-gray-400">BE {pickerYear + 543}</div>
                                </div>
                                <button
                                    onClick={() => setPickerYear(y => y + 1)}
                                    className="ui-btn ui-btn-neutral p-1.5 rounded-xl transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                            {/* Month grid - 3x4 */}
                            <div className="grid grid-cols-3 gap-1.5">
                                {Array.from({ length: 12 }, (_, i) => {
                                    const monthDate = new Date(pickerYear, i, 1);
                                    const mk = format(monthDate, 'yyyy-MM');
                                    const isCurrent = mk === monthKey;
                                    const hasShifts = shifts.some(s => s.date.startsWith(mk));
                                    const monthName = format(monthDate, 'MMM');
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => { setCurrentDate(monthDate); setShowMonthPicker(false); }}
                                            className={`relative px-1 py-2.5 text-xs rounded-xl transition-all text-center
                                                ${isCurrent
                                                    ? 'ui-btn-success shadow-sm'
                                                    : hasShifts
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'ui-btn-neutral'}`}
                                        >
                                            {monthName}
                                            {hasShifts && (
                                                <span className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-white/70' : 'bg-emerald-400'}`} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </GsapPresence>
                    )}
                </div>

                <div ref={toolbarRef} className="flex flex-wrap items-center justify-end gap-1.5">
                    {monthLocked && (
                        <span className={getToolbarChipClass('info', 'select-none')}>
                            Month Locked
                        </span>
                    )}
                    {activeInsightPack && (
                        <span className={getToolbarChipClass('success', 'select-none')}>
                            Priority Pack Ready
                        </span>
                    )}
                    {isPreviewReadonly && (
                        <span className={getToolbarChipClass('warning', 'select-none')}>
                            Preview mode (read only)
                        </span>
                    )}
                    {isEditor && (
                        <button
                            onClick={() => { setShowSmartImport(true); }}
                            disabled={!canMutate || monthLocked}
                            data-toolbar-action
                            className={getToolbarChipClass('accent')}
                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : (monthLocked ? 'Month is locked in History' : undefined)}
                        >
                            <Sparkles className="h-3 w-3" /> Smart Import
                        </button>
                    )}
                    <button
                        className={getToolbarChipClass('info')}
                        onClick={() => setShowHistoryModal(true)}
                        data-toolbar-action
                    >
                        <History className="h-3 w-3" /> History
                    </button>
                    {isEditor && (
                        <button
                            className={getToolbarChipClass('success')}
                            disabled={!canMutate || monthLocked}
                            data-toolbar-action
                            onClick={handleSaveVersion}
                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : (monthLocked ? 'Month is locked in History' : undefined)}
                        >
                            <Save className="h-3 w-3" /> Save
                        </button>
                    )}
                    {isEditor && (
                        <button
                            disabled={!canMutate || monthLocked}
                            data-toolbar-action
                            onClick={() => setShowClearMonthConfirm(true)}
                            className={getToolbarChipClass('danger')}
                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : (monthLocked ? 'Month is locked in History' : undefined)}
                        >
                            <Trash2 className="h-3 w-3" /> Clear Month
                        </button>
                    )}
                    {isEditor && (
                        <div className="relative">
                            <button
                                onClick={() => setShowGenDropdown(p => !p)}
                                disabled={isGenerating || !canMutate || monthLocked}
                                data-toolbar-action
                                className={getToolbarChipClass('success')}
                                title={!canMutate ? PREVIEW_READONLY_MESSAGE : (monthLocked ? 'Month is locked in History' : undefined)}
                            >
                                {isGenerating ? 'Generating...' : 'Auto-Generate'}
                                <ChevronRight className={`h-3 w-3 transition-transform ${showGenDropdown ? 'rotate-90' : ''}`} />
                            </button>
                            {showGenDropdown && (
                                <div ref={genDropdownRef} className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[280px]">
                                    <GsapPresence
                                        preset="banner"
                                        className="ui-panel backdrop-blur-md border border-emerald-100/50 shadow-xl shadow-emerald-900/5 rounded-2xl p-2"
                                    >
                                        <div className="px-3 pb-2 pt-1 mb-1 border-b border-gray-50 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Generate Options</span>
                                            <Sparkles className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => handleGenerateClick('all')}
                                                data-toolbar-option
                                                className="group w-full rounded-xl p-3 text-left transition-all hover:bg-emerald-50 active:scale-[0.98] outline-none"
                                            >
                                                <div className="flex items-center justify-between pointer-events-none">
                                                    <span className="text-sm font-semibold text-emerald-900 group-hover:text-emerald-700 transition-colors">Full Monthly Schedule</span>
                                                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                                        <ChevronRight className="w-3.5 h-3.5 text-emerald-700" />
                                                    </div>
                                                </div>
                                                <span className="mt-1 block text-xs font-medium text-emerald-600/70 pointer-events-none">Fills 1st, 2nd, and 3rd call completely</span>
                                            </button>

                                            <button
                                                onClick={() => handleGenerateClick('2nd3rd')}
                                                data-toolbar-option
                                                className="group w-full rounded-xl p-3 text-left transition-all hover:bg-amber-50 active:scale-[0.98] outline-none"
                                            >
                                                <div className="flex items-center justify-between pointer-events-none">
                                                    <span className="text-sm font-semibold text-amber-900 group-hover:text-amber-700 transition-colors">Fill 2nd & 3rd Call Only</span>
                                                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                                        <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
                                                    </div>
                                                </div>
                                                <span className="mt-1 block text-xs font-medium text-amber-700/60 pointer-events-none">Preserves your existing 1st call assignments</span>
                                            </button>
                                        </div>
                                    </GsapPresence>
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        onClick={() => setViewMode(viewMode === 'calendar' ? 'excel' : 'calendar')}
                        data-toolbar-action
                        className={getToolbarChipClass('neutral')}
                    >
                        {viewMode === 'calendar' ? 'Excel' : 'Calendar'}
                    </button>
                    <button
                        onClick={exportPDF}
                        data-toolbar-action
                        className={getToolbarChipClass('accent')}
                    >
                        <FileDown className="h-3 w-3" /> Export PDF
                    </button>
                    <button
                        onClick={() => {
                            if (layoutAnimating) return;
                            setShowPersonPanel(p => !p);
                        }}
                        title={showPersonPanel ? 'Hide personnel' : 'Show personnel'}
                        disabled={layoutAnimating}
                        data-toolbar-action
                        className={getToolbarChipClass(showPersonPanel ? 'success' : 'neutral', layoutAnimating ? 'opacity-70' : '')}
                    >
                        <Users className="h-3 w-3" /> Personnel
                    </button>
                    {isEditor && (
                        <button
                            disabled={!canMutate}
                            data-toolbar-action
                            onClick={() => { setIsSelectingNoon(!isSelectingNoon); if (offDayPersonId) setOffDayPersonId(null); }}
                            className={getToolbarChipClass('warning')}
                            title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                        >
                            {isSelectingNoon ? 'Done Noon' : 'Noon'}
                        </button>
                    )}
                    <div className="flex items-center gap-1">
                        <button
                            data-toolbar-action
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            className={getToolbarChipClass('neutral', 'px-2 py-2')}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            data-toolbar-action
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            className={getToolbarChipClass('neutral', 'px-2 py-2')}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>



            {isSelectingNoon && (
                <GsapPresence preset="banner" className="m-4 mb-0 p-3 bg-amber-100/75 border border-amber-300 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-sm font-medium text-amber-800">Select <strong>Noon Days</strong> on the calendar.</span>
                    </div>
                    <button onClick={() => setIsSelectingNoon(false)} className="text-xs font-bold uppercase tracking-widest text-amber-600 hover:text-amber-800">Done</button>
                </GsapPresence>
            )}

            {offDayPersonId && (() => {
                const p = offDayPersonId ? peopleById.get(offDayPersonId) : undefined;
                return (
                    <GsapPresence preset="banner" className="mx-4 mt-3 mb-0 p-3 bg-rose-100/80 border border-rose-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CalendarX2 className="w-4 h-4 text-rose-600 shrink-0" />
                            <span className="text-sm font-bold text-rose-800">
                                Marking off days for <span className="text-rose-600">{p?.name}</span>
                            </span>
                            <span className="text-xs text-rose-500">- click dates on the calendar to toggle</span>
                        </div>
                        <button onClick={() => setOffDayPersonId(null)} className="text-xs font-bold uppercase tracking-widest text-rose-600 hover:text-rose-800">Done</button>
                    </GsapPresence>
                );
            })()}

            {highlightedPersonId && (
                <GsapPresence preset="banner" className="mx-4 mt-3 mb-0 p-3 bg-indigo-100/70 border border-indigo-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-violet-600" />
                        <span className="text-sm font-bold text-violet-800">
                            Viewing shifts for <span className="text-violet-600">{getPersonName(highlightedPersonId)}</span>
                        </span>
                        <span className="text-xs text-violet-500">
                            ({monthShiftsByPerson.get(highlightedPersonId)?.length || 0} shifts this month)
                        </span>
                    </div>
                    <button onClick={() => setHighlightedPersonId(null)} className="p-1 text-violet-400 hover:text-violet-700 rounded-full hover:bg-violet-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </GsapPresence>
            )}



            {/* Main content area - calendar/excel + personnel panel side by side */}
            <div className="flex flex-1 overflow-hidden min-h-0">

                {/* Calendar Grid */}
                {viewMode === 'calendar' && (
                    <div ref={calendarPaneRef} className="flex-1 overflow-auto p-3 sm:p-4 flex flex-col gap-4 min-h-0" style={{ background: 'var(--ui-surface-base)' }}>
                        <div className="ui-panel rounded-2xl overflow-hidden shrink-0">
                            <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface-subtle)' }}>
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className={`p-3 text-center text-xs font-bold tracking-wider uppercase ${day === 'Sat' || day === 'Sun' ? 'text-rose-400' : 'text-gray-500'}`}>
                                        {day}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
                                {calendarDays.map(date => {
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    const isThisMonth = isSameMonth(date, currentDate);
                                    const isTodayDate = isToday(date);
                                    const holiday = holidays.find(h => h.date === dateStr);
                                    const isHoliday = !!holiday;
                                    const isManualHighlight = manualHighlights.includes(dateStr);
                                    const isOffDay = isWeekend(date) || isHoliday;
                                    const isHighlight = isHoliday || isOffDay || isManualHighlight;
                                    const isNoon = noonDays.includes(dateStr);
                                    const dayShifts = getShiftsForDay(date).filter(s => s.personId !== '__locked__');
                                    const hasHighlightedPerson = highlightedPersonId
                                        ? dayShifts.some(s => s.personId === highlightedPersonId)
                                        : false;
                                    const offDayPerson = offDayPersonId ? peopleById.get(offDayPersonId) || null : null;
                                    const isPersonOffDay = offDayPerson?.unavailableDates?.includes(dateStr) ?? false;

                                    const isPastDay = isBefore(startOfDay(date), startOfDay(new Date()));
                                    const dimPastCss = dimPastDays && isPastDay ? 'opacity-60 grayscale-[0.2]' : '';

                                    return (
                                        <div
                                            key={dateStr}
                                            onClick={() => {
                                                if (!isThisMonth) return;
                                                if (isMobileV2) {
                                                    const payload = buildMobileDayPayload(date);
                                                    setMobileDayEditor(payload);
                                                    setLastFocusedDay(payload.date);
                                                    return;
                                                }
                                                if (offDayPersonId) { togglePersonOffDay(dateStr); return; }
                                                if (isSelectingNoon) {
                                                    if (isNoon) setNoonDays(noonDays.filter(d => d !== dateStr));
                                                    else setNoonDays([...noonDays, dateStr]);
                                                }
                                            }}
                                            className={`calendar-day-cell min-h-[110px] ${tableDensity === 'compact' ? 'p-1' : 'p-2'} flex flex-col gap-1 relative transition-all
                                            ${!isThisMonth ? 'opacity-35' : ''}
                                            ${dimPastCss}
                                            ${isTodayDate && isThisMonth ? 'ring-2 ring-inset ring-emerald-600 z-10' : ''}
                                            ${hasHighlightedPerson ? 'ring-2 ring-inset ring-violet-400 bg-violet-50' : ''}
                                            ${highlightedPersonId && !hasHighlightedPerson && isThisMonth ? 'opacity-50' : ''}
                                            ${offDayPersonId && isThisMonth ? (isPersonOffDay ? 'bg-rose-100 ring-2 ring-inset ring-rose-400 cursor-pointer' : 'cursor-pointer hover:bg-rose-50/60') : ''}
                                            ${isSelectingNoon && !offDayPersonId ? 'cursor-pointer hover:bg-yellow-50/50' : ''}`}
                                            style={{ background: !isThisMonth ? undefined : hasHighlightedPerson ? undefined : (isHighlight && weekendHighlight === 'full') ? 'var(--ui-holiday-bg)' : 'var(--ui-surface-raised)' }}
                                        >
                                            <div className="flex items-start justify-between mb-0.5">
                                                <span className={`${tableDensity === 'compact' ? 'text-xs w-5 h-5' : 'text-sm w-6 h-6'} font-bold flex items-center justify-center rounded-full ${isTodayDate ? 'bg-emerald-600 text-white' : 'text-gray-700'}`} style={!isTodayDate && isOffDay && weekendHighlight !== 'none' ? { color: 'var(--ui-holiday-date-text)' } : undefined}>
                                                    {format(date, 'd')}
                                                    {isNoon && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-400 border border-white"></div>}
                                                </span>
                                                {holiday && (
                                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded max-w-[72px] truncate leading-tight" style={{ background: 'var(--ui-holiday-pill-bg)', color: 'var(--ui-holiday-pill-text)', border: '1px solid var(--ui-holiday-pill-border)' }} title={holiday.name}>
                                                        {holiday.name}
                                                    </span>
                                                )}
                                            </div>
                                            {dayShifts.length === 0 && isThisMonth && (
                                                <div className="text-[10px] text-gray-300 text-center mt-2">-</div>
                                            )}
                                            {dayShifts
                                                .sort((a, b) => a.level.localeCompare(b.level))
                                                .map((shift, i) => {
                                                    const isActive = highlightedPersonId === shift.personId;
                                                    const shiftPerson = peopleById.get(shift.personId);
                                                    const shiftTokens = getCombinedSemanticTokens({
                                                        slot: SLOT_BY_LEVEL[shift.level],
                                                        tagIds: shiftPerson?.tagIds || [],
                                                    });
                                                    const shiftMixedClass = shiftTokens.mode === 'mixed' ? 'semantic-mixed-chip' : '';
                                                    const firstCallVariantClass = shift.level === '1A'
                                                        ? 'border border-emerald-300/60'
                                                        : shift.level === '1B'
                                                            ? 'border border-teal-300/60'
                                                            : '';
                                                    return (
                                                        <div
                                                            key={i}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setHighlightedPersonId(
                                                                    highlightedPersonId === shift.personId ? null : shift.personId
                                                                );
                                                            }}
                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 truncate cursor-pointer transition-all
                                                            ${isActive
                                                                    ? 'ring-2 ring-violet-500 bg-violet-100 text-violet-800'
                                                                    : `${shiftTokens.softBg} ${shiftMixedClass} ${firstCallVariantClass}`
                                                                }`}
                                                            style={!isActive ? shiftTokens.stripeCss : undefined}
                                                            title={`${shift.level}: ${getPersonName(shift.personId)} - click to highlight`}
                                                        >
                                                            <span className="shrink-0 opacity-60 text-[9px]">{shift.level}</span>
                                                            <span className="truncate">{getPersonName(shift.personId)}</span>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                )}

                {/* List View */}
                {viewMode === 'excel' && (
                    <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--ui-surface-base)' }}>
                        {isMobileV2 ? (
                            <div className="space-y-3">
                                <div className="ui-panel rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-gray-900">Spreadsheet summary (mobile)</h3>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Day-level editing is optimized for mobile. Tap a day card below to open Day Editor.
                                    </p>
                                </div>
                                {calendarDays
                                    .filter((day) => isSameMonth(day, monthStart))
                                    .map((day) => {
                                        const dateStr = format(day, 'yyyy-MM-dd');
                                        const dayShifts = getShiftsForDay(day).filter((s) => s.personId !== '__locked__');
                                        return (
                                            <button
                                                key={`mobile-day-${dateStr}`}
                                                onClick={() => {
                                                    const payload = buildMobileDayPayload(day);
                                                    setMobileDayEditor(payload);
                                                    setLastFocusedDay(payload.date);
                                                }}
                                                className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-left"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-bold text-gray-800">{format(day, 'EEE, d MMM')}</p>
                                                    <span className="text-[11px] text-emerald-700 font-semibold">Edit</span>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {dayShifts.length === 0 && (
                                                        <span className="text-[11px] text-gray-400">No assignments</span>
                                                    )}
                                                    {dayShifts.map((shift) => (
                                                        <span key={`${dateStr}-${shift.level}`} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                                                            {shift.level}: {getPersonName(shift.personId)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        ) : (
                        <>
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-4">
                                <h3 className="text-sm caps-micro text-gray-500">Spreadsheet View</h3>
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ background: 'var(--ui-surface-subtle)', borderColor: 'var(--ui-border)' }}>
                                    <span className="text-[10px] caps-micro text-gray-500">1st Call Columns:</span>
                                    <button
                                        onClick={() => setFirstCallCount(prev => Math.max(1, prev - 1))}
                                        className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                    >-</button>
                                    <span className="text-xs font-bold w-4 text-center">{firstCallCount}</span>
                                    <button
                                        onClick={() => setFirstCallCount(prev => Math.min(5, prev + 1))}
                                        className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                    >+</button>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto overflow-y-visible rounded-2xl border min-h-[500px]" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface-raised)' }}>
                            <table className="w-full text-left border-collapse" style={{ zIndex: 1, position: 'relative' }}>
                                <thead>
                                    <tr className="border-b border-gray-100" style={{ background: 'var(--ui-surface-subtle)' }}>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-r border-gray-100 sticky left-0 z-30" style={{ background: 'var(--ui-surface-subtle)' }}>Date</th>
                                        {Array.from({ length: firstCallCount }).map((_, i) => (
                                            <th
                                                key={`1st-${i}`}
                                                className={`p-4 text-[10px] font-bold uppercase tracking-widest text-center min-w-[120px] ${i % 2 === 0 ? 'text-emerald-600' : 'text-teal-600'}`}
                                            >
                                                1st Call ({String.fromCharCode(65 + i)})
                                            </th>
                                        ))}
                                        <th
                                            className={`p-4 text-[10px] font-bold uppercase tracking-widest text-center min-w-[120px] ${getToneTextClass(secondPoolTokens.baseTone)} ${secondPoolTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}`}
                                            style={secondColumnHeaderStyle}
                                        >
                                            2nd Call
                                        </th>
                                        <th
                                            className={`p-4 text-[10px] font-bold uppercase tracking-widest text-center min-w-[120px] ${getToneTextClass(thirdPoolTokens.baseTone)} ${thirdPoolTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}`}
                                            style={thirdColumnHeaderStyle}
                                        >
                                            3rd Call
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {calendarDays.filter(d => isSameMonth(d, monthStart)).map((day, idx) => {
                                        const dateStr = format(day, 'yyyy-MM-dd');
                                        const holiday = holidays.find(h => h.date === dateStr);
                                        const isHighlight = isWeekend(day) || !!holiday;
                                        const isTodayDay = isToday(day);
                                        const isPastDay = isBefore(startOfDay(day), startOfDay(new Date()));
                                        const dimPastCssRow = dimPastDays && isPastDay ? 'opacity-60 grayscale-[0.2]' : '';

                                        const dayShifts = getShiftsForDay(day);
                                        const rowHasHighlight = highlightedPersonId
                                            ? dayShifts.some(s => s.personId === highlightedPersonId)
                                            : false;
                                        const holidayRowStyle = !rowHasHighlight && isHighlight && weekendHighlight === 'full'
                                            ? { background: 'linear-gradient(rgba(255,255,255,0.38), rgba(255,255,255,0.38)), var(--ui-holiday-bg)' }
                                            : undefined;

                                        const handleCellChange = (level: string, newPersonId: string) => {
                                            if (!canMutate) {
                                                showToast(PREVIEW_READONLY_MESSAGE, false);
                                                return;
                                            }
                                            if (monthLocked) {
                                                showToast('Month is locked. Unlock in History before editing.', false);
                                                return;
                                            }
                                            const otherShifts = shifts.filter(s => {
                                                if (s.date !== dateStr) return true;
                                                if (s.level === level) return false;
                                                // Auto-move person to the selected level on this day.
                                                if (newPersonId && s.personId === newPersonId && s.personId !== '__locked__') return false;
                                                return true;
                                            });
                                            const updated = newPersonId
                                                ? [...otherShifts, { date: dateStr, personId: newPersonId, level: level as any }]
                                                : otherShifts;
                                            scheduleShiftAutosave(updated);
                                        };

                                        const renderDropdown = (level: string, poolTag: string, extraClass = '') => {
                                            const shift = dayShifts.find(s => s.level === level);
                                            const currentVal = shift?.personId || '';
                                            const isLocked = currentVal === '__locked__';
                                            const usedByOtherLevels = new Set(
                                                dayShifts
                                                    .filter(s => s.level !== level && s.personId !== '__locked__')
                                                    .map(s => s.personId),
                                            );
                                            const pool = sortedActivePeople
                                                .filter(p => p.tagIds?.includes(poolTag))
                                                .filter(p => p.id === currentVal || !usedByOtherLevels.has(p.id));
                                            const fallbackPool = sortedActivePeople
                                                .filter(p => p.id === currentVal || !usedByOtherLevels.has(p.id));

                                            if (!canMutate) {
                                                if (isLocked) return <span className="text-gray-300 text-xs">-</span>;
                                                if (!shift) return <span className="text-gray-300">-</span>;
                                                const readonlyPastelStyle = toPastelCellStyle(peopleById.get(shift.personId)?.color);
                                                return (
                                                    <span
                                                        className="inline-flex items-center justify-center w-full text-sm font-bold rounded-lg px-2 py-1.5 border"
                                                        style={readonlyPastelStyle || undefined}
                                                    >
                                                        {getPersonName(shift.personId)}
                                                    </span>
                                                );
                                            }

                                            const getDisplayName = (p: Person) => {
                                                const subsetId = p.tagIds?.find(t => subsetOptions.some(opt => opt.id === t));
                                                const subsetName = subsetOptions.find(opt => opt.id === subsetId)?.labelEnTh;
                                                return subsetName ? `${p.name} (${subsetName})` : p.name;
                                            };

                                            const selectedPerson = peopleById.get(currentVal);
                                            const selectedPastelStyle = toPastelCellStyle(selectedPerson?.color);
                                            const hasCurrentInPool = pool.some(p => p.id === currentVal) || fallbackPool.some(p => p.id === currentVal);
                                            const shouldInjectLockedOption = !!currentVal && currentVal !== '__locked__' && !hasCurrentInPool;
                                            const slot = SLOT_BY_LEVEL[level];
                                            const poolSemanticTokens = getCombinedSemanticTokens({
                                                slot,
                                                tagIds: pool.flatMap((person) => person.tagIds || []),
                                            });
                                            const selectedSemanticTokens = currentVal && currentVal !== '__locked__'
                                                ? getCombinedSemanticTokens({
                                                    slot,
                                                    tagIds: selectedPerson?.tagIds || [],
                                                })
                                                : poolSemanticTokens;
                                            const hasAssignedPerson = !!currentVal && !isLocked;
                                            const mixedClass = selectedSemanticTokens.mode === 'mixed' ? 'semantic-mixed-chip' : '';

                                            return (
                                                <select
                                                    value={currentVal}
                                                    onChange={e => handleCellChange(level, e.target.value)}
                                                    disabled={!canMutate || monthLocked}
                                                    data-filled={!!currentVal}
                                                    className={`w-full text-xs font-bold rounded-lg px-2 py-1.5 border transition-colors cursor-pointer
                                                        ${isLocked ? 'bg-gray-100 text-gray-500 border-gray-300' : currentVal ? 'border-transparent' : 'bg-gray-50 border-gray-100 text-gray-400'}
                                                        ${hasAssignedPerson ? '' : (!currentVal ? poolSemanticTokens.softBg : '')}
                                                        ${hasAssignedPerson ? '' : mixedClass}
                                                        focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed ${extraClass}`}
                                                    style={isLocked
                                                        ? { minWidth: '100px' }
                                                        : {
                                                            minWidth: '100px',
                                                            ...(hasAssignedPerson ? (selectedPastelStyle || {}) : {}),
                                                            ...(!hasAssignedPerson ? poolSemanticTokens.stripeCss : {}),
                                                        }}
                                                    title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                >
                                                    <option value="" style={{ backgroundColor: '#f9fafb', color: '#9ca3af' }}>- empty -</option>
                                                    <option value="__locked__" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>LOCKED</option>
                                                    {shouldInjectLockedOption && (
                                                        <option value={currentVal} style={toPastelOptionStyle(selectedPerson?.color)}>
                                                            {getPersonName(currentVal)}
                                                        </option>
                                                    )}
                                                    {pool.map(p => (
                                                        <option
                                                            key={p.id}
                                                            value={p.id}
                                                            style={toPastelOptionStyle(p.color)}
                                                        >
                                                            {getDisplayName(p)}
                                                        </option>
                                                    ))}
                                                    {/* Show all people as fallback if pool is empty */}
                                                    {pool.length === 0 && fallbackPool.map(p => (
                                                        <option
                                                            key={p.id}
                                                            value={p.id}
                                                            style={toPastelOptionStyle(p.color)}
                                                        >
                                                            {getDisplayName(p)}
                                                        </option>
                                                    ))}
                                                </select>
                                            );
                                        };

                                        return (
                                            <tr key={idx} className={`border-b border-gray-50 transition-all relative
                                            ${dimPastCssRow}
                                            ${rowHasHighlight ? 'bg-violet-50' : ''}
                                            ${highlightedPersonId && !rowHasHighlight ? 'opacity-50' : ''}`}
                                                style={holidayRowStyle}>
                                                <td className={`${tableDensity === 'compact' ? 'py-2 px-3 text-xs' : 'p-4 text-sm'} font-medium border-r border-gray-100 sticky left-0 z-20
                                                ${rowHasHighlight ? 'bg-violet-50' : ''}
                                                ${isTodayDay ? 'text-emerald-700 font-bold' : ''}`}
                                                    style={holidayRowStyle || (!rowHasHighlight ? { background: 'var(--ui-surface-raised)' } : undefined)}>
                                                    <div className="flex flex-col">
                                                        <span style={(isHighlight && weekendHighlight !== 'none' && !isTodayDay) ? { color: 'var(--ui-holiday-date-text)' } : undefined}>{format(day, 'EEE, d MMM')}</span>
                                                        {holiday && <span className={`${tableDensity === 'compact' ? 'text-[9px]' : 'text-[10px]'} font-bold mt-1`} style={{ color: 'var(--ui-holiday-date-text)' }}>{holiday.name}</span>}
                                                    </div>
                                                </td>
                                                {Array.from({ length: firstCallCount }).map((_, i) => {
                                                    const lvl = `1${String.fromCharCode(65 + i)}`;
                                                    return (
                                                        <td key={`1st-${i}`} className={`${tableDensity === 'compact' ? 'p-1' : 'p-2'} border-r border-gray-50 text-center`}>
                                                            {renderDropdown(lvl, 'first_call', i % 2 === 0 ? 'border-emerald-300/60' : 'border-teal-300/60')}
                                                        </td>
                                                    );
                                                })}
                                                <td
                                                    className={`${tableDensity === 'compact' ? 'p-1' : 'p-2'} border-r border-gray-50 text-center ${(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? '' : getToneSoftClass(secondPoolTokens.baseTone)} ${(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? '' : (secondPoolTokens.mode === 'mixed' ? 'semantic-mixed-chip' : '')}`}
                                                    style={(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? undefined : secondColumnBodyStyle}
                                                >
                                                    {renderDropdown('2', 'second_call')}
                                                </td>
                                                <td
                                                    className={`${tableDensity === 'compact' ? 'p-1' : 'p-2'} text-center ${(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? '' : getToneSoftClass(thirdPoolTokens.baseTone)} ${(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? '' : (thirdPoolTokens.mode === 'mixed' ? 'semantic-mixed-chip' : '')}`}
                                                    style={(!rowHasHighlight && isHighlight && weekendHighlight === 'full') ? undefined : thirdColumnBodyStyle}
                                                >
                                                    {renderDropdown('3', 'third_call')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                        )}
                    </div>
                )}

                {/* Personnel Panel - full management */}
                <aside
                    ref={personPanelRef}
                    className={`ui-panel shrink-0 flex flex-col overflow-hidden ${showPersonPanel || layoutAnimating ? 'border-l border-gray-100' : 'border-l-0'}`}
                    style={{
                        width: showPersonPanel ? panelWidthPx : 0,
                        opacity: showPersonPanel ? 1 : 0,
                        pointerEvents: showPersonPanel ? 'auto' : 'none',
                    }}
                >

                    {/* Panel header */}
                    <div className="px-2 xl:px-2.5 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[10px] caps-micro text-gray-500">Personnel</span>
                            <span className="text-[10px] text-gray-400 tabular-nums">({people.length})</span>
                            <span className="text-[10px] text-emerald-600 caps-ui">Active {activePeople.length}</span>
                        </div>
                        {isEditor && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        if (!canMutate) {
                                            showToast(PREVIEW_READONLY_MESSAGE, false);
                                            return;
                                        }
                                        setIsQuickAddOpen(prev => !prev);
                                        setQuickAddCallMenuOpen(false);
                                        setQuickAddError(null);
                                    }}
                                    title="Add person"
                                    className="px-2 py-1 rounded-lg text-[10px] caps-ui border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                    disabled={!canMutate}
                                >
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                                <Link
                                    to={`/team?month=${monthKey}`}
                                    title="Open Personnel page for full profile edits"
                                    className="px-2 py-1 rounded-lg text-[10px] caps-ui bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                    Manage
                                </Link>
                            </div>
                        )}
                    </div>
                    {isEditor && isQuickAddOpen && (
                        <div className="px-2 xl:px-2.5 py-1.5 border-b border-gray-100 bg-gray-50/60">
                            <p className="mb-1 text-[10px] text-gray-500">
                                Call Tag = เวรที่ลงได้, Rule Group Tag = กลุ่มกติกา solver/โควตา
                            </p>
                            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,1fr,1fr,auto] gap-1.5 items-center">
                                <input
                                    type="text"
                                    value={quickAddDraft.name}
                                    onChange={(e) => setQuickAddDraft(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Name"
                                    className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setQuickAddCallMenuOpen(prev => !prev)}
                                        className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 text-left flex items-center justify-between"
                                    >
                                        <span className="truncate">
                                            {quickAddDraft.callTagIds.length > 0
                                                ? quickAddDraft.callTagIds.map((id) => CALL_TAG_DISPLAY[id].label).join(' + ')
                                                : 'Call Tag (เวรที่ลงได้)'}
                                        </span>
                                        <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${quickAddCallMenuOpen ? 'rotate-90' : ''}`} />
                                    </button>
                                    {quickAddCallMenuOpen && (
                                        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-1 space-y-1">
                                            {CALL_TAGS.map((tag) => {
                                                const selected = quickAddDraft.callTagIds.includes(tag.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`quick-add-call-${tag.id}`}
                                                        onClick={() => setQuickAddDraft((prev) => ({
                                                            ...prev,
                                                            callTagIds: selected
                                                                ? prev.callTagIds.filter((id) => id !== tag.id)
                                                                : [...prev.callTagIds, tag.id],
                                                        }))}
                                                        className={`w-full px-2 py-1 rounded text-[10px] font-bold border text-left ${selected ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                                    >
                                                        {tag.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <select
                                    value={quickAddDraft.subsetId}
                                    onChange={(e) => setQuickAddDraft(prev => ({ ...prev, subsetId: e.target.value }))}
                                    className="px-2 py-1 text-[10px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                >
                                    <option value="">Rule Group Tag (กลุ่มกติกา)</option>
                                    {subsetOptions.map(option => (
                                        <option key={`quick-add-subset-${option.id}`} value={option.id}>
                                            {option.labelEnTh}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={submitQuickAdd}
                                        disabled={quickAddSaving || !canMutate}
                                        className="px-2 py-1 rounded-lg text-[10px] caps-ui bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {quickAddSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsQuickAddOpen(false);
                                            setQuickAddCallMenuOpen(false);
                                            setQuickAddError(null);
                                        }}
                                        className="px-2 py-1 rounded-lg text-[10px] caps-ui bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                            {quickAddError && (
                                <p className="text-[10px] font-bold text-rose-600 mt-1">{quickAddError}</p>
                            )}
                        </div>
                    )}
                    {isEditor && templates.length > 0 && (
                        <div className="px-2 xl:px-2.5 py-1.5 border-b border-gray-100 bg-gray-50/60">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-500 caps-micro">Template</span>
                                <select
                                    value={monthRoster?.templateId || templates.find(t => t.isDefault)?.id || templates[0]?.id}
                                    disabled={!canMutate}
                                    onChange={async (e) => {
                                        try {
                                            const res = await apiFetch(`/api/roster/month/${monthKey}`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    templateId: e.target.value,
                                                    overrides: monthRoster?.overrides || {},
                                                }),
                                            });
                                            await ensureApiSuccess(res);
                                            const data = await res.json();
                                            setMonthRoster(data.roster || null);
                                        } catch (err) {
                                            handleMutationError(err, 'Failed to update template');
                                        }
                                    }}
                                    className="flex-1 px-2 py-1 text-[10px] border border-gray-200 rounded-lg bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                >
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Add new person inline form */}
                    {/* Search */}
                    {people.length > 5 && (
                        <div className="px-2 xl:px-2.5 py-1.5 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-2.5 py-1.5 border border-gray-100">
                                <Search className="w-3 h-3 text-gray-400 shrink-0" />
                                <input type="text" value={personSearch} onChange={e => setPersonSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="flex-1 bg-transparent text-[11px] text-gray-700 placeholder:text-gray-400 outline-none min-w-0" />
                                {personSearch && <button onClick={() => setPersonSearch('')} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
                            </div>
                        </div>
                    )}

                    {/* Person list grouped by call combination */}
                    <div
                        className="flex-1 overflow-y-auto"
                        onClick={() => {
                            setSubsetPickerFor(null);
                            setEligibilityPickerFor(null);
                            setTagEditorFor(null);
                        }}
                    >
                        {(() => {
                            const q = personSearch.toLowerCase();
                            const groups = new Map<string, typeof people>();
                            const groupMeta = new Map(
                                getSummaryGroupDefinitions(DEFAULT_SUBSETS).map(group => [group.id, group])
                            );

                            people.filter(p => includedSet.has(p.id)).forEach(p => {
                                if (!p.name.toLowerCase().includes(q)) return;
                                const summaryGroup = getPersonSummaryGroup(p, DEFAULT_SUBSETS);
                                if (!groups.has(summaryGroup.id)) groups.set(summaryGroup.id, []);
                                groups.get(summaryGroup.id)!.push(p);
                            });

                            const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
                                const am = groupMeta.get(a);
                                const bm = groupMeta.get(b);
                                const ao = am?.order ?? 9_999;
                                const bo = bm?.order ?? 9_999;
                                if (ao !== bo) return ao - bo;
                                return (am?.label || a).localeCompare(bm?.label || b);
                            });

                            return sortedGroups.map(([groupKey, members]) => {
                                const isGroupCollapsed = panelCollapsed.has(groupKey);
                                const displayLabel = groupMeta.get(groupKey)?.label || 'Other';
                                const groupTokens = getCombinedSemanticTokens({
                                    tagIds: [groupKey],
                                    subsetId: groupKey,
                                });
                                const headerClass = groupTokens.softBg;

                                return (
                                    <div key={groupKey}>
                                        {/* Group header */}
                                        <button
                                            onClick={() => togglePanelGroup(groupKey)}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left border-b hover:opacity-80 transition-colors ${headerClass} ${groupTokens.mode === 'mixed' ? 'semantic-mixed-chip' : ''}`}
                                            style={groupTokens.stripeCss}
                                        >
                                            <span className="text-[10px] font-bold uppercase tracking-widest flex-1">{displayLabel}</span>
                                            <span className="text-[10px] font-bold tabular-nums opacity-60">{members.length}</span>
                                            <ChevronRight className={`w-3 h-3 opacity-50 transition-transform ${isGroupCollapsed ? '' : 'rotate-90'}`} />
                                        </button>

                                        {!isGroupCollapsed && members.map(person => {
                                            const shiftCount = monthSummary[person.id]?.total || (monthShiftsByPerson.get(person.id)?.length || 0);
                                            const personSummary = monthSummary[person.id] || {
                                                weekday: 0,
                                                holiday: 0,
                                                consecutivePairs: 0,
                                                everyOtherDayPairs: 0,
                                                noonCount: 0,
                                                personId: person.id,
                                                total: 0,
                                                firstCount: 0,
                                                secondCount: 0,
                                                thirdCount: 0,
                                                firstDates: [],
                                                secondDates: [],
                                                thirdDates: [],
                                                noonDates: [],
                                            };
                                            const riskAlerts = deriveRiskAlertsFromSummary(person.id, personSummary);
                                            const isHighlighted = highlightedPersonId === person.id;
                                            const isOffDay = offDayPersonId === person.id;
                                            const isIncluded = includedSet.has(person.id);
                                            const subset = getSubsetDisplay(person.tagIds || [], schedulingConfig);

                                            return (
                                                <div key={person.id} className="border-b border-gray-50">
                                                    {/* Quick-edit person row */}
                                                    <div className={`group flex items-start gap-1.5 xl:gap-2 px-2 xl:px-2.5 ${rowDensity === 'comfortable' ? 'py-2.5' : 'py-2'} transition-colors
                                                        ${isOffDay ? 'bg-rose-50 ring-1 ring-inset ring-rose-200' : isHighlighted ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                                                        {/* Avatar */}
                                                        <div
                                                            className="w-6 h-6 xl:w-7 xl:h-7 rounded-full flex items-center justify-center text-white text-[9px] xl:text-[10px] font-bold shrink-0 cursor-pointer"
                                                            style={{ backgroundColor: person.color || '#10b981' }}
                                                            onClick={() => setHighlightedPersonId(isHighlighted ? null : person.id)}
                                                            title="Highlight shifts"
                                                        >
                                                            {person.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        {/* Row identity: Name + subset/assign + include */}
                                                        <div className="flex-1 min-w-0 cursor-pointer"
                                                            onClick={() => setHighlightedPersonId(isHighlighted ? null : person.id)}>
                                                            <div className="inline-flex items-center gap-1 min-w-0 flex-nowrap pr-1 leading-none align-middle">
                                                                <p className={`text-[12px] font-bold whitespace-nowrap ${isHighlighted ? 'text-violet-800' : isOffDay ? 'text-rose-800' : 'text-gray-800'}`}>
                                                                    {person.name}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    disabled={!canMutate}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSubsetPickerFor(prev => prev === person.id ? null : person.id);
                                                                    }}
                                                                    className={`h-5 inline-flex items-center align-middle leading-none text-[9.5px] xl:text-[10px] font-bold px-1.5 rounded-md border whitespace-nowrap disabled:opacity-50 ${subset ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-gray-200 bg-gray-50/70 text-gray-500'}`}
                                                                    style={subset ? { backgroundColor: subset.color, color: '#1f2937' } : undefined}
                                                                    title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                                >
                                                                    {subset?.labelEnTh || 'Set Rule Group'}
                                                                </button>
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEligibilityPickerFor(prev => prev === person.id ? null : person.id);
                                                                        }}
                                                                        disabled={!canMutate}
                                                                        className={`h-5 inline-flex items-center align-middle leading-none px-1.5 rounded-md text-[9.5px] xl:text-[10px] font-bold whitespace-nowrap transition-opacity focus-visible:opacity-80 ${isIncluded ? 'bg-emerald-600 text-white opacity-30 hover:opacity-70' : 'bg-rose-600 text-white opacity-30 hover:opacity-70'}`}
                                                                        title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                                    >Include</button>
                                                                    {eligibilityPickerFor === person.id && (
                                                                        <div
                                                                            className="absolute top-6 left-0 z-20 min-w-[130px] rounded-lg border border-gray-200 bg-white shadow-lg p-1.5 space-y-1"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <button
                                                                                onClick={async () => {
                                                                                    await setEligibility(person.id, 'include');
                                                                                    setEligibilityPickerFor(null);
                                                                                }}
                                                                                disabled={!canMutate}
                                                                                className={`w-full text-left px-2 py-1 rounded text-[10px] font-bold ${isIncluded ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-gray-50 text-gray-700'} disabled:opacity-50`}
                                                                            >
                                                                                Included
                                                                            </button>
                                                                            <button
                                                                                onClick={async () => {
                                                                                    await setEligibility(person.id, 'exclude');
                                                                                    setEligibilityPickerFor(null);
                                                                                }}
                                                                                disabled={!canMutate}
                                                                                className={`w-full text-left px-2 py-1 rounded text-[10px] font-bold ${!isIncluded ? 'bg-rose-100 text-rose-700' : 'hover:bg-gray-50 text-gray-700'} disabled:opacity-50`}
                                                                            >
                                                                                Excluded
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {subsetPickerFor === person.id && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {subsetOptions.map(option => (
                                                                        <button
                                                                            key={`subset-calendar-${person.id}-${option.id}`}
                                                                            disabled={!canMutate}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                updateSubsetTag(person, option.id);
                                                                            }}
                                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
                                                                        >
                                                                            {option.labelEnTh}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-[10px] text-gray-500 tabular-nums leading-snug break-words">
                                                                {shiftCount > 0 ? `${shiftCount} Shifts` : 'No Shift'}
                                                                {isOffDay && <span className="ml-1 text-rose-500 font-bold">- off days (ok)</span>}
                                                            </p>
                                                            <div className="mt-0 flex items-center gap-1">
                                                                <p className="text-[10px] text-gray-500 tabular-nums leading-snug break-words min-w-0">
                                                                    WD {personSummary.weekday} - HD {personSummary.holiday} - Noon {personSummary.noonCount || 0}
                                                                </p>
                                                                {isEditor && (
                                                                    <div className="flex items-center gap-0.5 relative shrink-0 ml-0.5">
                                                                        <button
                                                                            disabled={!canMutate}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setTagEditorFor(prev => prev === person.id ? null : person.id);
                                                                            }}
                                                                            title="Edit tags"
                                                                            className="h-6 w-6 xl:h-7 xl:w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        >
                                                                            <Pencil className="w-3 xl:w-3.5 h-3 xl:h-3.5" />
                                                                        </button>
                                                                        {tagEditorFor === person.id && (
                                                                            <div
                                                                                className="absolute right-0 top-7 z-30 w-56 rounded-xl border border-gray-200 bg-white shadow-xl p-2 space-y-2"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <div>
                                                                                    <p className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">Call Tag (เวรที่ลงได้)</p>
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {CALL_TAGS.map(tag => {
                                                                                            const selected = (person.tagIds || []).includes(tag.id);
                                                                                            const display = CALL_TAG_DISPLAY[tag.id];
                                                                                            return (
                                                                                                <button
                                                                                                    key={`tag-edit-${person.id}-${tag.id}`}
                                                                                                    disabled={!canMutate}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        toggleAnyTag(person, tag.id);
                                                                                                    }}
                                                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${selected ? display.solidClass : display.softClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                                                                    title={!canMutate ? PREVIEW_READONLY_MESSAGE : undefined}
                                                                                                >
                                                                                                    {tag.label}
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">Rule Group Tag (กลุ่มกติกา)</p>
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {subsetOptions.map(option => {
                                                                                            const selected = (person.tagIds || []).includes(option.id);
                                                                                            const optionSubset = getSubsetDisplay([option.id], schedulingConfig);
                                                                                            return (
                                                                                                <button
                                                                                                    key={`subset-edit-${person.id}-${option.id}`}
                                                                                                    disabled={!canMutate}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        updateSubsetTag(person, option.id);
                                                                                                    }}
                                                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${selected ? 'text-gray-900 border-gray-300' : 'bg-white text-gray-700 border-gray-200'} disabled:opacity-50`}
                                                                                                    style={optionSubset && selected ? { backgroundColor: optionSubset.color } : undefined}
                                                                                                >
                                                                                                    {option.labelEnTh}
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                                {(() => {
                                                                                    const knownTagIds = new Set<string>([
                                                                                        ...CALL_TAG_IDS,
                                                                                        ...subsetOptions.map(option => option.id),
                                                                                    ]);
                                                                                    const extraTags = (person.tagIds || []).filter(tag => !knownTagIds.has(tag));
                                                                                    if (extraTags.length === 0) return null;
                                                                                    return (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">Other tags</p>
                                                                                            <div className="flex flex-wrap gap-1">
                                                                                                {extraTags.map(tag => (
                                                                                                    <button
                                                                                                        key={`extra-edit-${person.id}-${tag}`}
                                                                                                        disabled={!canMutate}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            toggleAnyTag(person, tag);
                                                                                                        }}
                                                                                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-gray-50 text-gray-700 border-gray-200 disabled:opacity-50"
                                                                                                    >
                                                                                                        {tag}
                                                                                                    </button>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        )}
                                                                        <button
                                                                            disabled={!canMutate}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setOffDayPersonId(isOffDay ? null : person.id);
                                                                            }}
                                                                            title={isOffDay ? 'Stop editing off days' : 'Mark off days on calendar'}
                                                                            className={`h-6 w-6 xl:h-7 xl:w-7 flex items-center justify-center rounded-lg transition-colors
                                                                                    ${isOffDay ? 'bg-rose-100 text-rose-600' : 'hover:bg-rose-50 text-gray-400 hover:text-rose-500'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                                        >
                                                                            <CalendarX2 className="w-3 xl:w-3.5 h-3 xl:h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            disabled={!canMutate}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                requestDeletePreview(person);
                                                                            }}
                                                                            title="Delete person"
                                                                            className="h-6 w-6 xl:h-7 xl:w-7 flex items-center justify-center rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        >
                                                                            <Trash2 className="w-3 xl:w-3.5 h-3 xl:h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {riskAlerts.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {riskAlerts.map(alert => (
                                                                        <span key={`panel-risk-${person.id}-${alert.kind}`} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                                                            {alert.message}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {(() => {
                                                                const offDates = (person.unavailableDates || [])
                                                                    .filter((d): d is string => typeof d === 'string' && d.startsWith(monthKey));
                                                                const offDays = offDates
                                                                    .map((d) => Number.parseInt(d.split('-')[2] || '', 10))
                                                                    .filter((day) => Number.isFinite(day));
                                                                return offDays.length > 0 ? (
                                                                    <p className="text-[10px] text-rose-500 font-bold break-words leading-snug" title={offDates.join(', ')}>
                                                                        Off: {offDays.join(', ')}
                                                                    </p>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })
                        })()}
                        {people.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center p-4">
                                <Users className="w-8 h-8 text-gray-200" />
                                <p className="text-[11px] text-gray-400">No members yet</p>
                            </div>
                        )}
                    </div>
                </aside>

            </div>{/* end flex content wrapper */}

            <ViolationPanel violations={violations} currentDate={currentDate} />

            <HistoryModal
                isOpen={showHistoryModal}
                monthKey={monthKey}
                lockedVersionId={monthLock?.versionId || null}
                onClose={() => {
                    setShowHistoryModal(false);
                    setRestoreConflict(null);
                    setRestoreResult(null);
                }}
                onRestore={handleRestoreVersion}
                restoreConflict={restoreConflict}
                restoreResult={restoreResult}
                restoreLoading={restoreLoading}
                onResolveRestoreConflict={handleResolveRestoreConflict}
                onDismissRestoreResult={() => setRestoreResult(null)}
                onDelete={handleDeleteVersion}
                onLock={handleLockVersion}
                onRename={handleRenameVersion}
                onUnlock={handleUnlockMonth}
            />
            <SmartImportModal
                isOpen={showSmartImport}
                onClose={() => setShowSmartImport(false)}
                monthKey={monthKey}
                people={people}
                showToast={showToast}
            />
            <DayEditorSheet
                open={!!mobileDayEditor && isMobileV2}
                payload={mobileDayEditor}
                onClose={() => setMobileDayEditor(null)}
                onChange={(slot, value) => {
                    if (!mobileDayEditor || !canMutate || monthLocked) return;
                    upsertDayLevelShift(mobileDayEditor.date, slot, value);
                    setMobileDayEditor({
                        ...mobileDayEditor,
                        values: { ...mobileDayEditor.values, [slot]: value },
                    });
                }}
            />
            {/* Clear Month Confirm Modal */}
            {showClearMonthConfirm && (
                <div className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4">
                    <GsapPresence preset="modal" className="max-w-sm w-full">
                        <div ref={clearModalRef} className="glass-dialog rounded-3xl p-8">
                            <div className="flex flex-col items-center text-center gap-4">
                                <div
                                    data-clear-modal-badge
                                    className="glass-panel flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200/60"
                                >
                                    <AlertTriangle className="h-8 w-8 text-rose-500" />
                                </div>
                                <div>
                                    <h3 className="mb-2 text-lg caps-title text-gray-900">Clear Schedule?</h3>
                                    <p className="whitespace-pre-wrap text-sm text-gray-600">
                                        Are you sure you want to clear all shifts for{'\n'}
                                        <strong className="text-gray-800">{format(currentDate, 'MMMM yyyy')}</strong>?{'\n'}
                                        <span className="mt-1 block text-xs font-medium text-rose-500">This action cannot be undone.</span>
                                    </p>
                                </div>
                                <div className="mt-4 flex w-full gap-3">
                                    <button
                                        onClick={() => setShowClearMonthConfirm(false)}
                                        className="glass-chip glass-chip--neutral flex-1 rounded-xl px-4 py-3 text-sm font-medium normal-case tracking-[0.02em]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowClearMonthConfirm(false);
                                            try {
                                                if (shiftAutosaveTimeoutRef.current) clearTimeout(shiftAutosaveTimeoutRef.current);
                                                shiftAutosaveTimeoutRef.current = null;
                                                pendingShiftAutosaveRef.current = null;
                                                const res = await apiFetch('/api/shifts/clear-month', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ monthKey }),
                                                });
                                                if (res.status === 404) {
                                                    await saveShiftsImmediately(shifts.filter(s => !s.date.startsWith(monthKey)));
                                                } else {
                                                    await ensureApiSuccess(res);
                                                    const data = await res.json();
                                                    setShifts(Array.isArray(data.shifts) ? data.shifts : shifts.filter(s => !s.date.startsWith(monthKey)));
                                                }
                                                showToast('Month cleared', true);
                                            } catch (err) {
                                                handleMutationError(err, 'Failed to clear month');
                                            }
                                        }}
                                        className="glass-chip glass-chip--rose flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium normal-case tracking-[0.02em]"
                                    >
                                        <Trash2 className="h-4 w-4" /> Clear
                                    </button>
                                </div>
                            </div>
                        </div>
                    </GsapPresence>
                </div>
            )}
            {deletePreview && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100">
                        <h3 className="caps-title text-gray-900 text-base">Move {deletePreview.person.name} to Deleted Folder?</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            ระบบจะซ่อนบุคลากรออกจากหน้าหลัก และถอดเวรที่ผูกกับคนนี้ออกจากตารางปัจจุบัน
                        </p>
                        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                            <p><strong>{deletePreview.removedShiftCount}</strong> เวรจะถูกถอดออก</p>
                            <p className="mt-1">1A: {deletePreview.affectedByLevel['1A']} | 1B: {deletePreview.affectedByLevel['1B']} | 2: {deletePreview.affectedByLevel['2']} | 3: {deletePreview.affectedByLevel['3']}</p>
                            <p className="mt-1">เดือนที่ได้รับผลกระทบ: {deletePreview.affectedMonths.length ? deletePreview.affectedMonths.join(', ') : '-'}</p>
                            {deletePreview.affectedDatesSample.length > 0 && (
                                <p className="mt-1">ตัวอย่างวันที่: {deletePreview.affectedDatesSample.join(', ')}</p>
                            )}
                            {deletePreview.warnings.map((w, idx) => <p key={idx} className="mt-1">{w}</p>)}
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={() => setDeletePreview(null)}
                                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm caps-ui text-gray-600 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSoftDelete}
                                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-sm caps-ui hover:bg-rose-700"
                            >
                                Move to Folder
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showHardViolationConfirmModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100">
                        <h3 className="caps-title text-gray-900 text-base">Apply schedule with hard violations?</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            This generated schedule contains <strong>{pendingHardViolationCount}</strong> hard violation(s).
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            Confirm to apply and persist, or cancel to keep the current schedule.
                        </p>
                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={() => {
                                    setShowHardViolationConfirmModal(false);
                                    setPendingMergedShifts(null);
                                    setPendingHardViolationCount(0);
                                }}
                                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm caps-ui text-gray-600 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!pendingMergedShifts) return;
                                    try {
                                        await persistMergedShifts(pendingMergedShifts);
                                        showToast(`Saved with ${pendingHardViolationCount} hard violation(s)`, false);
                                    } catch (err) {
                                        handleMutationError(err, 'Failed to save generated schedule');
                                    } finally {
                                        setShowHardViolationConfirmModal(false);
                                        setPendingMergedShifts(null);
                                        setPendingHardViolationCount(0);
                                    }
                                }}
                                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-sm caps-ui hover:bg-rose-700"
                            >
                                Apply anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* No 3rd Call Warning Modal */}
            {
                showNo3rdCallModal && (
                    <GsapPresence preset="banner" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
                        <GsapPresence preset="modal" className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl border border-gray-100">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="caps-title text-gray-900 text-base">No 3rd Call Personnel</h3>
                                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                                        No one is tagged as <strong className="text-gray-700">3rd Call</strong>. The schedule will be generated without any 3rd call assignments.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowNo3rdCallModal(false)}
                                    className="flex-1 py-2.5 border border-gray-200 rounded-2xl text-sm caps-ui text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { setShowNo3rdCallModal(false); generateSchedule(); }}
                                    disabled={!canMutate}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm caps-ui hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Generate Anyway
                                </button>
                            </div>
                        </GsapPresence>
                    </GsapPresence>
                )
            }

            {/* Loading Popup for Schedule Generation */}
            {isGenerating && (
                <GsapPresence
                    preset="banner"
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
                >
                    <GsapPresence
                        preset="modal"
                        role="status"
                        aria-live="polite"
                        className="w-full max-w-sm"
                    >
                        <div ref={loadingPopupRef} className="glass-dialog rounded-3xl p-7 shadow-2xl">
                            <div data-loading-badge className="glass-panel mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200/60">
                                <div className="relative flex items-center justify-center">
                                    <Sparkles className="h-6 w-6 text-rose-500" />
                                    <span data-loading-orb className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
                                    <span data-loading-orb className="absolute -left-1.5 bottom-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                                </div>
                            </div>

                            <h3 data-loading-title className="text-center text-base font-semibold text-gray-900">
                                Cooking your schedule...
                            </h3>
                            <p data-loading-subtitle className="mt-1 text-center text-sm font-medium text-gray-600">
                                Finding the fairest shift mix for everyone.
                            </p>

                            <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
                                <span data-loading-orb className="h-2 w-2 rounded-full bg-rose-400" />
                                <span data-loading-orb className="h-2 w-2 rounded-full bg-amber-400" />
                                <span data-loading-orb className="h-2 w-2 rounded-full bg-emerald-400" />
                            </div>
                        </div>
                    </GsapPresence>
                </GsapPresence>
            )}

            {/* Toast Notification */}
            {
                toast && (
                    <GsapPresence preset="toast" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold
                    ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
                        style={{ minWidth: '220px' }}>
                        {toast.ok
                            ? <CheckCircle className="w-4 h-4 shrink-0" />
                            : <AlertTriangle className="w-4 h-4 shrink-0" />
                        }
                        <span>{toast.msg}</span>
                    </GsapPresence>
                )
            }
        </div >
    );
}
