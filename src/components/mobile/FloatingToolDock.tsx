import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type MobileDockState = 'expanded' | 'compact' | 'hidden';

export interface MobileDockAction {
    id: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
    disabled?: boolean;
}

interface FloatingToolDockProps {
    state: MobileDockState;
    actions: MobileDockAction[];
    onAction: (id: string) => void;
    onToggleCollapse: () => void;
}

export default function FloatingToolDock({ state, actions, onAction, onToggleCollapse }: FloatingToolDockProps) {
    if (state === 'hidden') return null;

    return (
        <div className="md:hidden fixed bottom-3 left-0 right-0 z-[95] px-3 pointer-events-none">
            <div className="mx-auto max-w-[520px] rounded-2xl border shadow-xl backdrop-blur-xl px-2 py-2 pointer-events-auto"
                style={{
                    borderColor: 'var(--ui-border)',
                    background: 'color-mix(in srgb, var(--ui-surface-raised) 88%, white 12%)',
                }}>
                <div className={`grid gap-1 ${state === 'compact' ? 'grid-cols-6' : 'grid-cols-3'}`}>
                    {actions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={action.id}
                                onClick={() => onAction(action.id)}
                                disabled={action.disabled}
                                className={`min-h-[48px] rounded-xl px-2 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors ${action.active ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'} ${action.disabled ? 'opacity-45' : ''}`}
                            >
                                <Icon className="w-4 h-4" />
                                {state === 'expanded' && <span className="truncate">{action.label}</span>}
                            </button>
                        );
                    })}
                    <button
                        onClick={onToggleCollapse}
                        className="min-h-[48px] rounded-xl px-2 py-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-100"
                    >
                        {state === 'expanded' ? 'Compact' : 'Expand'}
                    </button>
                </div>
            </div>
        </div>
    );
}
