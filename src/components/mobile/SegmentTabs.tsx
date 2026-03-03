import React from 'react';

export interface SegmentTabItem {
    id: string;
    label: string;
}

interface SegmentTabsProps {
    tabs: SegmentTabItem[];
    active: string;
    onChange: (id: string) => void;
    className?: string;
}

export default function SegmentTabs({ tabs, active, onChange, className = '' }: SegmentTabsProps) {
    return (
        <div className={`md:hidden ui-panel-subtle rounded-xl p-1 grid gap-1 ${className}`} style={{ gridTemplateColumns: `repeat(${Math.max(1, tabs.length)}, minmax(0, 1fr))` }}>
            {tabs.map((tab) => {
                const isActive = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`min-h-[44px] rounded-lg text-[11px] font-bold transition-colors ${isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
