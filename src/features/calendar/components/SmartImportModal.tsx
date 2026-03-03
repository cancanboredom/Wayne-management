import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Upload, AlertCircle } from 'lucide-react';
import type { Person, Shift } from '../../../lib/shiftplan/types';
import { apiFetch } from '../../../lib/workspaceApi';
import { useScheduleStore } from '../../../lib/store/useScheduleStore';
import { GsapPresence } from '../../../components/animations/GsapPresence';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    monthKey: string;
    people: Person[];
    showToast: (msg: string, ok: boolean) => void;
}

export default function SmartImportModal({ isOpen, onClose, monthKey, people, showToast }: Props) {
    const { shifts, setShifts } = useScheduleStore();
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importPreview, setImportPreview] = useState<{ base64: string; mime: string; name: string } | null>(null);
    const [importResult, setImportResult] = useState<any[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state each time modal opens
    useEffect(() => {
        if (isOpen) {
            setImportPreview(null);
            setImportResult(null);
            setImportError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = e => {
            const [header, base64] = (e.target?.result as string).split(',');
            const mime = header.replace('data:', '').replace(';base64', '');
            setImportPreview({ base64, mime, name: file.name });
            setImportResult(null);
            setImportError(null);
        };
        reader.readAsDataURL(file);
    };

    const runSmartImport = async () => {
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
                    currentDateStr: monthKey,
                    people: people.map(p => ({ id: p.id, name: p.name })),
                }),
            });
            const data = await res.json();
            if (!res.ok) setImportError(data.error || 'Import failed');
            else setImportResult(data.shifts || []);
        } catch { setImportError('Network error'); }
        finally { setImportLoading(false); }
    };

    const applyImportedShifts = async () => {
        if (!importResult) return;
        await apiFetch('/api/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importResult),
        });
        const merged: Shift[] = [
            ...shifts.filter((s: Shift) => !importResult.some((r: any) => r.date === s.date && r.level === s.level)),
            ...importResult,
        ];
        setShifts(merged);
        onClose();
        showToast(`${importResult.length} shifts imported`, true);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
            <GsapPresence preset="modal" className="gradient-card rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                            <Sparkles className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">Smart Import</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Upload a schedule image — Gemini AI extracts shifts automatically.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Upload zone */}
                <div
                    className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                >
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
                    {importPreview ? (
                        <div className="flex flex-col items-center gap-2 w-full">
                            <img src={`data:${importPreview.mime};base64,${importPreview.base64}`} alt="preview" className="max-h-48 rounded-xl object-contain shadow-sm" />
                            <span className="text-xs text-gray-500">{importPreview.name}</span>
                            <span className="text-[10px] text-violet-600 font-bold">Click to change image</span>
                        </div>
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-300" />
                            <p className="text-sm font-bold text-gray-500">Drop image or click to upload</p>
                            <p className="text-xs text-gray-400">PNG, JPG, WEBP</p>
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
                    <button onClick={onClose}
                        className="flex-1 py-2.5 border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    {importResult ? (
                        <button onClick={applyImportedShifts}
                            className="flex-1 py-2.5 bg-violet-600 text-white rounded-2xl text-sm font-bold hover:bg-violet-700 transition-colors shadow-sm">
                            Apply to Calendar
                        </button>
                    ) : (
                        <button onClick={runSmartImport} disabled={!importPreview || importLoading}
                            className="flex-1 py-2.5 bg-violet-600 text-white rounded-2xl text-sm font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm">
                            <Sparkles className="w-4 h-4" />
                            {importLoading ? 'Analysing…' : 'Extract Shifts'}
                        </button>
                    )}
                </div>
            </GsapPresence>
        </div>
    );
}
