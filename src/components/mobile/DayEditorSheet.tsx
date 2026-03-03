import React from 'react';
import BottomSheet from './BottomSheet';

export interface DayEditorSlotOption {
    value: string;
    label: string;
}

export interface DayEditorPayload {
    date: string;
    displayDate: string;
    values: Record<'1A' | '1B' | '2' | '3', string>;
    optionsBySlot: Record<'1A' | '1B' | '2' | '3', DayEditorSlotOption[]>;
}

interface DayEditorSheetProps {
    open: boolean;
    payload: DayEditorPayload | null;
    onClose: () => void;
    onChange: (slot: '1A' | '1B' | '2' | '3', value: string) => void;
}

export default function DayEditorSheet({ open, payload, onClose, onChange }: DayEditorSheetProps) {
    if (!payload) return null;

    const slotRows: Array<{ key: '1A' | '1B' | '2' | '3'; label: string }> = [
        { key: '1A', label: '1st Call A' },
        { key: '1B', label: '1st Call B' },
        { key: '2', label: '2nd Call' },
        { key: '3', label: '3rd Call' },
    ];

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title="Day Editor"
            subtitle={payload.displayDate}
        >
            <div className="space-y-3">
                {slotRows.map((slot) => (
                    <label key={slot.key} className="block">
                        <span className="text-xs font-bold text-gray-700">{slot.label}</span>
                        <select
                            className="mt-1 w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm"
                            value={payload.values[slot.key] || ''}
                            onChange={(e) => onChange(slot.key, e.target.value)}
                        >
                            <option value="">- empty -</option>
                            {payload.optionsBySlot[slot.key].map((opt) => (
                                <option key={`${slot.key}-${opt.value}`} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </label>
                ))}
            </div>
        </BottomSheet>
    );
}
