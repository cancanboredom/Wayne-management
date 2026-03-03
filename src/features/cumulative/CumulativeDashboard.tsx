import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, subMonths } from 'date-fns';
import { BarChart2, Loader2, Search, Pin, PinOff, RefreshCcw, CheckCircle2 } from 'lucide-react';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { useCumulativeStore } from '../../lib/store/useCumulativeStore';
import { apiFetch } from '../../lib/workspaceApi';
import { getCombinedSemanticTokens } from '../shared/semanticColors';
import SurfaceBadge from '../../components/ui/SurfaceBadge';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { featureFlags } from '../../config/flags';
import BottomSheet from '../../components/mobile/BottomSheet';

const SURY_TAGS = ['r1sry', 'r2sry', 'r3sry'];
const MONTH_COLUMNS = 6;
const PIN_STORAGE_KEY = 'wayne_cumulative_pinned_person';

type SortMode = 'priority' | 'name' | 'total';
const SORT_LABELS: Record<SortMode, string> = {
    priority: 'Who Needs Help First',
    name: 'Name',
    total: 'Total Load',
};

function isSuryPerson(tagIds: string[]) {
    return tagIds.some(t => SURY_TAGS.includes(t));
}

function getSuryLabel(tagIds: string[]) {
    if (tagIds.includes('r1sry')) return 'R1 Sury';
    if (tagIds.includes('r2sry')) return 'R2 Sury';
    if (tagIds.includes('r3sry')) return 'R3 Sury';
    return 'Sury';
}

function getGroupRank(tagIds: string[]) {
    if (tagIds.includes('r1sry')) return 1;
    if (tagIds.includes('r2sry')) return 2;
    if (tagIds.includes('r3sry')) return 3;
    return 9;
}

function getRecentMonthKeys(count: number): string[] {
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i--) keys.push(format(subMonths(new Date(), i), 'yyyy-MM'));
    return keys;
}

export default function CumulativeDashboard() {
    const { peopleByMonth, setPeopleForMonth, setShifts } = useScheduleStore();
    const { data, loaded, setData, getTotalForPerson, getDeficits, getCumulativeWeights } = useCumulativeStore();

    const [loading, setLoading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [finalizeStatus, setFinalizeStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [finalizeMonth, setFinalizeMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
    const [search, setSearch] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('priority');
    const [showFinalizeSheet, setShowFinalizeSheet] = useState(false);
    const [pinnedPersonId, setPinnedPersonId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(PIN_STORAGE_KEY);
    });
    const pageGradient = getGradientRecipe('cumulative', 'page-bg');
    const isMobileV2 = featureFlags.mobileV2;

    const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const people = peopleByMonth['all'] || [];
    const activePeopleById = useMemo(
        () => new Map(people.map(p => [p.id, p])),
        [people],
    );
    const deficits = getDeficits();
    const monthKeys = getRecentMonthKeys(MONTH_COLUMNS);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [stateRes, cumulativeRes] = await Promise.all([
                    apiFetch('/api/state'),
                    apiFetch('/api/cumulative'),
                ]);
                if (stateRes.ok) {
                    const state = await stateRes.json();
                    setPeopleForMonth('all', state.people || []);
                    setShifts(state.shifts || []);
                }
                if (cumulativeRes.ok) {
                    const payload = await cumulativeRes.json();
                    setData(payload.data || {});
                }
            } finally {
                setLoading(false);
            }
        };
        if (!loaded || people.length === 0) load();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!pinnedPersonId) localStorage.removeItem(PIN_STORAGE_KEY);
        else localStorage.setItem(PIN_STORAGE_KEY, pinnedPersonId);
    }, [pinnedPersonId]);

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = Object.entries(data)
            .map(([personId, rec]) => {
                const active = activePeopleById.get(personId);
                const tagIds = active?.tagIds || rec.tagIds || [];
                const hasHistory = Object.keys(rec.months || {}).length > 0;
                const isSuryLike = isSuryPerson(tagIds) || hasHistory;
                if (!isSuryLike) return null;
                const person = {
                    id: personId,
                    name: active?.name || rec.name || personId,
                    color: active?.color || '#6b7280',
                    tagIds,
                };
                const totals = getTotalForPerson(personId);
                const deficit = deficits[personId] ?? 0;
                const groupLabel = isSuryPerson(tagIds) ? getSuryLabel(tagIds) : 'Former Sury';
                const groupRank = isSuryPerson(tagIds) ? getGroupRank(tagIds) : 8;
                const priorityScore = deficit * 10 - totals.total;
                return {
                    person,
                    totals,
                    deficit,
                    groupLabel,
                    groupRank,
                    priorityScore,
                };
            })
            .filter((row): row is NonNullable<typeof row> => !!row)
            .filter(row => !q || row.person.name.toLowerCase().includes(q));

        base.sort((a, b) => {
            if (sortMode === 'name') return a.person.name.localeCompare(b.person.name);
            if (sortMode === 'total') return b.totals.total - a.totals.total || a.groupRank - b.groupRank;
            if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
            if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
            return a.person.name.localeCompare(b.person.name);
        });
        return base;
    }, [activePeopleById, deficits, search, sortMode, data]);

    const pinnedRow = rows.find(r => r.person.id === pinnedPersonId) || null;
    const behindCount = rows.filter(r => r.deficit > 0).length;
    const supportNowCount = rows.filter(r => r.deficit >= 1).length;
    const aheadCount = rows.filter(r => r.deficit <= -1).length;
    const teamAvg = rows.length > 0 ? rows.reduce((sum, r) => sum + r.totals.total, 0) / rows.length : 0;
    const priorityRecommendations = rows
        .filter(r => r.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit)
        .slice(0, 3);
    const weights = getCumulativeWeights();
    const secondPoolTokens = getCombinedSemanticTokens({ slot: 'second_call', tagIds: rows.flatMap(r => r.person.tagIds || []) });
    const thirdPoolTokens = getCombinedSemanticTokens({ slot: 'third_call', tagIds: rows.flatMap(r => r.person.tagIds || []) });

    const jumpToPerson = (personId: string) => {
        const el = rowRefs.current[personId];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleFinalize = async () => {
        setFinalizing(true);
        setFinalizeStatus('idle');
        try {
            const res = await apiFetch('/api/cumulative/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthKey: finalizeMonth }),
            });
            if (!res.ok) throw new Error('finalize failed');
            const payload = await res.json();
            setData(payload.data || {});
            setFinalizeStatus('ok');
        } catch {
            setFinalizeStatus('error');
        } finally {
            setFinalizing(false);
        }
    };

    const handleRebuild = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/cumulative/rebuild', { method: 'POST' });
            if (!res.ok) throw new Error('rebuild failed');
            const payload = await res.json();
            setData(payload.data || {});
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ui-page-root flex flex-col h-full overflow-hidden" style={{ background: pageGradient.background }}>
            <div className="ui-page-header px-4 sm:px-6 py-4 shrink-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-xl caps-title text-gray-900 flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-indigo-600" />
                            Cumulative Balance
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            A quick fairness view for Sury rotation: who should get the next 2nd/3rd-call opportunities.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRebuild}
                            className="ui-btn ui-btn-neutral px-3 py-2 rounded-xl text-xs caps-ui flex items-center gap-1"
                        >
                            <RefreshCcw className="w-3.5 h-3.5" /> Refresh History
                        </button>
                        <span className="px-3 py-2 rounded-xl text-xs caps-micro bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Server DB
                        </span>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="ui-panel-subtle rounded-xl p-3">
                        <p className="text-xs caps-micro text-gray-500">People in pool</p>
                        <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
                    </div>
                    <div className="ui-panel-subtle rounded-xl p-3">
                        <p className="text-xs caps-micro text-gray-500">Team average</p>
                        <p className="text-2xl font-bold text-gray-900">{teamAvg.toFixed(1)}</p>
                    </div>
                    <div className="ui-panel-subtle rounded-xl p-3">
                        <p className="text-xs caps-micro text-gray-500">อยู่น้อยกว่าคนอื่น</p>
                        <p className="text-2xl font-bold text-rose-600">{behindCount}</p>
                    </div>
                    <div className="ui-panel-subtle rounded-xl p-3">
                        <p className="text-xs caps-micro text-gray-500">Weight signals</p>
                        <p className="text-2xl font-bold text-indigo-600">{Object.keys(weights).length}</p>
                    </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                    ควรช่วยก่อน: {supportNowCount} · อยู่เยอะกว่าคนอื่น: {aheadCount}
                </p>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
                <div className="ui-panel rounded-2xl p-4">
                    <div className="flex items-end gap-3 flex-wrap">
                        <div>
                            <label className="block text-[10px] caps-micro text-gray-500 mb-1">Lock Month Into History</label>
                            <input
                                type="month"
                                value={finalizeMonth}
                                onChange={e => setFinalizeMonth(e.target.value)}
                                className="ui-input px-3 py-2 text-sm rounded-xl"
                            />
                        </div>
                        {isMobileV2 ? (
                            <button
                                onClick={() => setShowFinalizeSheet(true)}
                                disabled={finalizing || rows.length === 0}
                                className="ui-btn ui-btn-accent px-4 py-2 rounded-xl text-sm caps-ui flex items-center gap-2 min-h-[44px]"
                            >
                                Finalize This Month
                            </button>
                        ) : (
                            <button
                                onClick={handleFinalize}
                                disabled={finalizing || rows.length === 0}
                                className="ui-btn ui-btn-accent px-4 py-2 rounded-xl text-sm caps-ui flex items-center gap-2"
                            >
                                {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Finalize This Month
                            </button>
                        )}
                        {finalizeStatus === 'ok' && <span className="text-sm font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Month finalized</span>}
                        {finalizeStatus === 'error' && <span className="text-sm font-bold text-rose-600">Could not finalize month</span>}
                    </div>
                </div>

                <div className="ui-panel rounded-2xl p-4">
                    <div className={`flex items-center gap-2 flex-wrap ${isMobileV2 ? 'sticky top-0 z-10 bg-white/90 backdrop-blur-sm pb-2' : ''}`}>
                        <div className="ui-panel-subtle flex items-center gap-2 rounded-xl px-3 py-2 flex-1 min-w-[220px]">
                            <Search className="w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name..."
                                className="ui-input bg-transparent border-0 outline-none text-sm flex-1 min-w-0"
                            />
                        </div>
                        {(['priority', 'name', 'total'] as SortMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setSortMode(mode)}
                                className={`ui-btn px-3 py-2 rounded-xl text-xs caps-ui ${sortMode === mode ? 'ui-btn-accent' : 'ui-btn-neutral'}`}
                            >
                                {SORT_LABELS[mode]}
                            </button>
                        ))}
                    </div>

                    {pinnedRow && (
                        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                            <div className="flex items-center gap-2">
                                <Pin className="w-4 h-4 text-indigo-600" />
                                <p className="text-sm font-bold text-indigo-800 flex-1">
                                    Focus person: {pinnedRow.person.name} · {pinnedRow.groupLabel} · total {pinnedRow.totals.total}
                                </p>
                                <SurfaceBadge slotId="second_call" semanticMode={secondPoolTokens.mode} accentTags={secondPoolTokens.accentThemes} miniLegend className="border">
                                    2nd Pool
                                </SurfaceBadge>
                                <SurfaceBadge slotId="third_call" semanticMode={thirdPoolTokens.mode} accentTags={thirdPoolTokens.accentThemes} miniLegend className="border">
                                    3rd Pool
                                </SurfaceBadge>
                                <button onClick={() => jumpToPerson(pinnedRow.person.id)} className="text-xs caps-ui text-indigo-700 hover:underline">Jump</button>
                                <button onClick={() => setPinnedPersonId(null)} className="text-xs caps-ui text-indigo-500 hover:underline">Clear</button>
                            </div>
                        </div>
                    )}
                    {priorityRecommendations.length > 0 && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] caps-micro text-amber-800 mb-1">Suggested Next Priority</p>
                            <div className="flex flex-wrap gap-1.5">
                                {priorityRecommendations.map((row) => (
                                    <button
                                        key={`prio-${row.person.id}`}
                                        onClick={() => jumpToPerson(row.person.id)}
                                        className="text-[11px] px-2 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                    >
                                        {row.person.name} (อยู่น้อยกว่าคนอื่น {row.deficit.toFixed(1)})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-3 space-y-2 max-h-[58vh] overflow-y-auto pr-1">
                        {loading ? (
                            <div className="py-10 flex items-center justify-center text-gray-400 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
                        ) : rows.map(row => {
                            const { person, totals, deficit, groupLabel } = row;
                            const scheduleHint = deficit > 0
                                ? 'คนนี้อยู่น้อยกว่าคนอื่น ควรได้คิวก่อนสำหรับ 2nd/3rd call'
                                : deficit < 0
                                    ? 'คนนี้อยู่เยอะกว่าคนอื่น รอคิวถัดไปได้'
                                    : 'คนนี้อยู่ใกล้เคียงคนอื่น';
                            return (
                                <div
                                    key={person.id}
                                    ref={el => { rowRefs.current[person.id] = el; }}
                                    className={`rounded-xl border p-3 ${pinnedPersonId === person.id ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200 bg-white'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: person.color || '#6b7280' }}>
                                            {person.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-gray-800 truncate">{person.name}</p>
                                            <div className="flex items-center gap-1.5">
                                                <SurfaceBadge tagIds={person.tagIds || []} subsetId={person.tagIds?.[0] || null} miniLegend className="border">
                                                    {groupLabel}
                                                </SurfaceBadge>
                                                <span className={`text-[10px] font-bold ${deficit > 0 ? 'text-rose-600' : deficit < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                                    {deficit > 0
                                                        ? `อยู่น้อยกว่าคนอื่น ${deficit.toFixed(1)}`
                                                        : deficit < 0
                                                            ? `อยู่เยอะกว่าคนอื่น ${Math.abs(deficit).toFixed(1)}`
                                                            : 'ใกล้เคียงคนอื่น'}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setPinnedPersonId(pinnedPersonId === person.id ? null : person.id)}
                                            className={`p-1.5 rounded-lg ${pinnedPersonId === person.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                            title="Pin me"
                                        >
                                            {pinnedPersonId === person.id ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                                        <span>Total <strong className="text-gray-900">{totals.total}</strong></span>
                                        <span>2nd <strong className="text-amber-700">{totals.s}</strong></span>
                                        <span>3rd <strong className="text-blue-700">{totals.t}</strong></span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {monthKeys.map(mk => {
                                            const rec = data[person.id]?.months?.[mk];
                                            const val = rec ? rec.s + rec.t : 0;
                                            return (
                                                <span key={`${person.id}-${mk}`} className={`text-[10px] px-2 py-0.5 rounded-full border ${val > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                    {format(new Date(`${mk}-01`), 'MMM')} {val || '—'}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-2 text-[11px] text-gray-500">{scheduleHint}</p>
                                </div>
                            );
                        })}
                        {!loading && rows.length === 0 && (
                            <div className="py-10 text-center text-gray-400 text-sm">No matching people found in this pool.</div>
                        )}
                    </div>
                </div>
            </div>
            <BottomSheet
                open={showFinalizeSheet && isMobileV2}
                onClose={() => setShowFinalizeSheet(false)}
                title="Finalize Month"
                subtitle="Lock this month into cumulative history"
                footer={(
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowFinalizeSheet(false)}
                            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={async () => {
                                await handleFinalize();
                                setShowFinalizeSheet(false);
                            }}
                            className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold"
                        >
                            Confirm Finalize
                        </button>
                    </div>
                )}
            >
                <p className="text-sm text-gray-600">
                    Month: <strong className="text-gray-900">{finalizeMonth}</strong>
                </p>
                <p className="mt-2 text-xs text-gray-500">
                    This action updates cumulative history used by fairness balancing.
                </p>
            </BottomSheet>
        </div>
    );
}
