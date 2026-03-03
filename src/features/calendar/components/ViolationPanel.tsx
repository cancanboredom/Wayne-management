import React, { useMemo, useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import type { Violation } from '../../../lib/shiftplan/types';

interface Props {
    violations: Violation[];
    currentDate: Date;
}

export default function ViolationPanel({ violations, currentDate }: Props) {
    const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);

    // Resize state
    const [panelHeight, setPanelHeight] = useState(256); // default 256px
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);

    const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (collapsed) return; // Prevent dragging while collapsed
        setIsDragging(true);
        dragStartY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
        dragStartHeight.current = panelHeight;
    };

    useEffect(() => {
        if (!isDragging) return;

        const onDragMove = (e: MouseEvent | TouchEvent) => {
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const deltaY = clientY - dragStartY.current;
            // Dragging up (negative delta) increases height
            // Limit height between 150px and 800px or window height - 200px
            const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 200 : 800;
            setPanelHeight(Math.max(150, Math.min(maxHeight, dragStartHeight.current - deltaY)));
        };

        const onDragEnd = () => setIsDragging(false);

        // Disable text selection while dragging
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);

        return () => {
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);
        };
    }, [isDragging]);

    const extractName = (msg: string) => {
        const match = msg.match(/^([^\s]+)/);
        return match ? match[1] : 'Unknown';
    };

    const toRangeText = (day: Violation['day']) => {
        if (Array.isArray(day) && day.length >= 2) return `${day[0]}-${day[1]}`;
        if (Array.isArray(day) && day.length === 1) return `${day[0]}`;
        if (typeof day === 'number') return `${day}`;
        return 'unknown day';
    };

    const classify = (msg: string): 'CONSECUTIVE' | 'ALTERNATE' | 'OFFDAY' | 'OTHER' => {
        if (msg.includes('ติดกัน')) return 'CONSECUTIVE';
        if (msg.includes('วันเว้นวัน')) return 'ALTERNATE';
        if (msg.includes('OFF')) return 'OFFDAY';
        return 'OTHER';
    };

    const advice = (v: Violation, person: string) => {
        const code = classify(v.msg);
        const range = toRangeText(v.day);
        if (code === 'CONSECUTIVE') {
            return {
                diagnosis: `${person} has back-to-back duties on ${range}.`,
                action: 'Move one of these days to another eligible person and keep one day gap.',
            };
        }
        if (code === 'ALTERNATE') {
            return {
                diagnosis: `${person} is on alternating-day pressure around ${range}.`,
                action: 'Swap one of those days with someone who has lower recent load.',
            };
        }
        if (code === 'OFFDAY') {
            return {
                diagnosis: `${person} is assigned on an off day (${range}).`,
                action: 'Reassign this shift or remove the off-day mark if it is intentionally available.',
            };
        }
        return {
            diagnosis: v.msg,
            action: 'Review this row and reassign the least constrained slot first.',
        };
    };

    const vm = useMemo(() => {
        const mapped = violations.map((v, idx) => {
            const person = extractName(v.msg);
            const an = advice(v, person);
            return {
                id: `${person}-${idx}-${toRangeText(v.day)}`,
                person,
                severity: v.sev === 'hard' ? 'hard' : 'soft',
                dayText: toRangeText(v.day),
                diagnosis: an.diagnosis,
                action: an.action,
            };
        });
        mapped.sort((a, b) => (a.severity === 'hard' && b.severity !== 'hard' ? -1 : a.severity !== 'hard' && b.severity === 'hard' ? 1 : a.person.localeCompare(b.person)));
        return mapped;
    }, [violations]);

    const byPerson = useMemo(() => {
        const groups = new Map<string, typeof vm>();
        for (const row of vm) {
            if (!groups.has(row.person)) groups.set(row.person, []);
            groups.get(row.person)!.push(row);
        }
        return Array.from(groups.entries()).map(([person, items]) => ({
            person,
            items,
            hard: items.filter(i => i.severity === 'hard').length,
            soft: items.filter(i => i.severity === 'soft').length,
        }));
    }, [vm]);

    const hardViolations = vm.filter(v => v.severity === 'hard');
    const softViolations = vm.filter(v => v.severity === 'soft');

    return (
        <div className="shrink-0 border-t-2 border-gray-100 gradient-card relative flex flex-col transition-colors"
            style={isDragging ? { borderTopColor: 'var(--ui-text-muted)' } : {}}
        >
            {/* Drag Handle */}
            {!collapsed && (
                <div
                    className="absolute top-[-10px] left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center z-10 group opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={onDragStart}
                    onTouchStart={onDragStart}
                    title="Drag to resize panel"
                >
                    <div className="bg-gray-400 rounded-full flex items-center justify-center px-4 py-0.5 shadow-sm text-white">
                        <GripHorizontal className="w-4 h-4" />
                    </div>
                </div>
            )}

            {/* Header bar */}
            <div className="flex items-center gap-2.5 px-5 py-2 bg-gray-50/80 border-b border-gray-100 shrink-0">
                {violations.length === 0
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    : <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${hardViolations.length > 0 ? 'text-rose-500' : 'text-amber-400'}`} />
                }
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex-1">
                    Violations — {format(currentDate, 'MMMM yyyy')}
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setCollapsed(prev => !prev)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                        title={collapsed ? 'Expand violation table' : 'Collapse violation table'}
                    >
                        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {collapsed ? 'Expand' : 'Collapse'}
                    </button>
                    {violations.length === 0 && (
                        <span className="text-[10px] font-bold text-emerald-600">No violations</span>
                    )}
                    {hardViolations.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                            {hardViolations.length} hard
                        </span>
                    )}
                    {softViolations.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                            {softViolations.length} soft
                        </span>
                    )}
                </div>
            </div>

            {!collapsed && violations.length > 0 && (
                <div
                    className="overflow-y-auto p-3 space-y-3"
                    style={{ height: `${panelHeight}px` }}
                >
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Priority Inbox</p>
                        <div className="space-y-2">
                            {vm.slice(0, 5).map(item => (
                                <div key={item.id} className={`rounded-xl border p-3 ${item.severity === 'hard' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-gray-800">{item.person} · Day {item.dayText}</p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.severity === 'hard' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {item.severity === 'hard' ? 'Hard' : 'Soft'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-700 mt-1">{item.diagnosis}</p>
                                    <p className="text-xs text-gray-500 mt-1"><span className="font-bold">Next:</span> {item.action}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">By Person</p>
                        <div className="space-y-1.5">
                            {byPerson.map(group => {
                                const expanded = expandedPeople.has(group.person);
                                return (
                                    <div key={group.person} className="rounded-xl border border-gray-200 overflow-hidden">
                                        <button
                                            onClick={() => setExpandedPeople(prev => {
                                                const next = new Set(prev);
                                                if (next.has(group.person)) next.delete(group.person);
                                                else next.add(group.person);
                                                return next;
                                            })}
                                            className="w-full px-3 py-2 bg-white hover:bg-gray-50 flex items-center gap-2 text-left"
                                        >
                                            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                            <span className="text-xs font-bold text-gray-800 flex-1">{group.person}</span>
                                            <span className="text-[10px] text-rose-600 font-bold">{group.hard} hard</span>
                                            <span className="text-[10px] text-amber-600 font-bold">{group.soft} soft</span>
                                        </button>
                                        {expanded && (
                                            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 space-y-1.5">
                                                {group.items.map(item => (
                                                    <div key={item.id} className="text-xs">
                                                        <p className="text-gray-700">{item.diagnosis}</p>
                                                        <p className="text-gray-500"><span className="font-bold">Next:</span> {item.action}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

