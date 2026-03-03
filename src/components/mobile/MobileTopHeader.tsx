import React from 'react';
import { Lock, Unlock } from 'lucide-react';

interface MobileTopHeaderProps {
    monthLabel: string;
    workspaceId: string;
    workspaces: Array<{ id: string; name: string }>;
    onWorkspaceChange: (id: string) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    isLocked?: boolean;
    isReadonly?: boolean;
}

export default function MobileTopHeader({
    monthLabel,
    workspaceId,
    workspaces,
    onWorkspaceChange,
    onPrevMonth,
    onNextMonth,
    isLocked = false,
    isReadonly = false,
}: MobileTopHeaderProps) {
    return (
        <div className="md:hidden sticky top-0 z-30 px-3 py-2 border-b backdrop-blur-xl"
            style={{
                borderColor: 'var(--ui-border)',
                background: 'color-mix(in srgb, var(--ui-surface-raised) 90%, white 10%)',
            }}>
            <div className="flex items-center gap-2">
                <button onClick={onPrevMonth} className="min-h-[44px] min-w-[44px] rounded-xl border border-gray-200 text-gray-600">‹</button>
                <div className="flex-1 min-w-0 text-center">
                    <p className="text-[11px] text-gray-500">Month</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{monthLabel}</p>
                </div>
                <button onClick={onNextMonth} className="min-h-[44px] min-w-[44px] rounded-xl border border-gray-200 text-gray-600">›</button>
            </div>
            <div className="mt-2 flex items-center gap-2">
                <select
                    value={workspaceId}
                    onChange={(e) => onWorkspaceChange(e.target.value)}
                    className="flex-1 min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700"
                >
                    {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <span className={`inline-flex items-center gap-1 rounded-xl px-2.5 min-h-[36px] text-[10px] font-bold border ${isLocked ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {isLocked ? 'Locked' : 'Editable'}
                </span>
                {isReadonly && (
                    <span className="inline-flex items-center rounded-xl px-2.5 min-h-[36px] text-[10px] font-bold border bg-gray-100 text-gray-700 border-gray-200">
                        Read only
                    </span>
                )}
            </div>
        </div>
    );
}
