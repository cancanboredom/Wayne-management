import React, { useState } from 'react';
import { Check, History, Pencil, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { useConfigStore } from '../../../lib/store/useConfigStore';
import { GsapPresence } from '../../../components/animations/GsapPresence';

interface Props {
    isOpen: boolean;
    monthKey: string;
    lockedVersionId: string | null;
    onClose: () => void;
    onRestore: (versionId: string) => void | Promise<void>;
    restoreConflict: { versionId: string; conflicts: Array<{ date: string; level: string; existingPersonId: string; incomingPersonId: string }> } | null;
    restoreResult: {
        restoredPeopleCount: number;
        restoredShiftCount: number;
        skippedConflictCount: number;
        overwrittenCount: number;
        monthKey: string;
    } | null;
    restoreLoading: boolean;
    onResolveRestoreConflict: (mode: 'skip' | 'overwrite') => void | Promise<void>;
    onDismissRestoreResult: () => void;
    onDelete: (versionId: string) => void | Promise<void>;
    onLock: (versionId: string) => void | Promise<void>;
    onRename: (versionId: string, name: string) => void | Promise<void>;
    onUnlock: (code: string) => void | Promise<void>;
}

export default function HistoryModal({
    isOpen,
    monthKey,
    lockedVersionId,
    onClose,
    onRestore,
    restoreConflict,
    restoreResult,
    restoreLoading,
    onResolveRestoreConflict,
    onDismissRestoreResult,
    onDelete,
    onLock,
    onRename,
    onUnlock,
}: Props) {
    const { versions } = useConfigStore();
    const monthVersions = versions
        .filter(v => v.month === monthKey)
        .sort((a, b) => b.timestamp - a.timestamp);
    const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [unlockCode, setUnlockCode] = useState('');
    const [unlocking, setUnlocking] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <GsapPresence preset="modal" className="gradient-card rounded-3xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <History className="w-5 h-5 text-emerald-600" /> Version History
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto bg-gray-50 rounded-xl border border-gray-100 p-2">
                    {monthVersions.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm font-medium">No saved versions for {monthKey} yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {monthVersions.map(v => (
                                <div key={v.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:border-emerald-200 transition-colors">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-bold text-sm truncate">{v.name?.trim() || format(new Date(v.timestamp), 'MMM d, yyyy HH:mm')}</div>
                                            <div className="text-[11px] text-gray-500 mt-0.5">{format(new Date(v.timestamp), 'MMM d, yyyy HH:mm')}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{v.shifts.length} shifts saved for {v.month}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {lockedVersionId === v.id ? (
                                                <button
                                                    onClick={() => {
                                                        setUnlockCode('');
                                                        setRestoreTarget(null);
                                                        setDeleteTarget(null);
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                                                >
                                                    Unlock (Code)
                                                </button>
                                            ) : !lockedVersionId ? (
                                                <button
                                                    onClick={async () => { await onLock(v.id); }}
                                                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                                                >
                                                    Lock
                                                </button>
                                            ) : null}
                                            <button
                                                onClick={() => {
                                                    setRenameTarget(v.id);
                                                    setRenameDraft(v.name?.trim() || format(new Date(v.timestamp), 'MMM d, yyyy HH:mm'));
                                                }}
                                                className="p-1.5 rounded-lg transition-colors text-sky-600 bg-sky-50 hover:bg-sky-100"
                                                title="Rename this saved version"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (lockedVersionId) return;
                                                    setRestoreTarget(v.id);
                                                    setDeleteTarget(null);
                                                }}
                                                disabled={!!lockedVersionId}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors
                                                ${restoreTarget === v.id
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}
                                                disabled:opacity-40 disabled:cursor-not-allowed`}
                                                title={lockedVersionId ? 'Unlock this month before restoring a version' : undefined}
                                            >
                                                Restore
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDeleteTarget(v.id);
                                                    setRestoreTarget(null);
                                                }}
                                                className={`p-1.5 rounded-lg transition-colors
                                                ${deleteTarget === v.id
                                                        ? 'bg-rose-600 text-white'
                                                        : 'text-rose-600 bg-rose-50 hover:bg-rose-100'}`}
                                                title="Delete this saved version"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {renameTarget === v.id && (
                                        <div className="mt-3 flex items-center gap-2">
                                            <input
                                                value={renameDraft}
                                                onChange={(e) => setRenameDraft(e.target.value)}
                                                placeholder="Version name"
                                                className="flex-1 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                                            />
                                            <button
                                                onClick={async () => {
                                                    await onRename(v.id, renameDraft);
                                                    setRenameTarget(null);
                                                }}
                                                className="px-3 py-2 text-xs font-bold rounded-lg text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setRenameTarget(null)}
                                                className="p-2 rounded-lg text-sky-700 bg-sky-100 hover:bg-sky-200 transition-colors"
                                                title="Cancel rename"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {lockedVersionId && (
                    <GsapPresence preset="banner" className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-indigo-900">Unlock month {monthKey}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <input
                                value={unlockCode}
                                onChange={(e) => setUnlockCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                type="password"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="Enter code"
                                className="w-24 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <button
                                disabled={unlocking || unlockCode.length !== 6}
                                onClick={async () => {
                                    setUnlocking(true);
                                    try {
                                        await onUnlock(unlockCode);
                                        setUnlockCode('');
                                    } finally {
                                        setUnlocking(false);
                                    }
                                }}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors text-indigo-700 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Unlock
                            </button>
                        </div>
                    </GsapPresence>
                )}

                {/* Restore confirmation strip */}
                {restoreTarget && !lockedVersionId && (() => {
                    const ver = monthVersions.find(v => v.id === restoreTarget);
                    return (
                        <GsapPresence preset="banner" className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-amber-900">Restore this version?</p>
                                <p className="text-xs text-amber-700 mt-0.5 truncate">
                                    {ver && format(new Date(ver.timestamp), 'MMM d, yyyy HH:mm')} - {ver?.shifts.length} shifts for {ver?.month}
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => setRestoreTarget(null)}
                                    className="px-3 py-1.5 text-xs font-bold border border-amber-300 text-amber-800 rounded-xl hover:bg-amber-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        await onRestore(restoreTarget);
                                        setRestoreTarget(null);
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
                                    disabled={restoreLoading}
                                >
                                    {restoreLoading ? 'Restoring…' : 'Confirm'}
                                </button>
                            </div>
                        </GsapPresence>
                    );
                })()}

                {/* Delete confirmation strip */}
                {deleteTarget && (() => {
                    const ver = monthVersions.find(v => v.id === deleteTarget);
                    return (
                        <GsapPresence preset="banner" className="mt-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-rose-900">Delete this saved version?</p>
                                <p className="text-xs text-rose-700 mt-0.5 truncate">
                                    {ver && format(new Date(ver.timestamp), 'MMM d, yyyy HH:mm')} - {ver?.shifts.length} shifts for {ver?.month}
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    className="px-3 py-1.5 text-xs font-bold border border-rose-300 text-rose-800 rounded-xl hover:bg-rose-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        await onDelete(deleteTarget);
                                        setDeleteTarget(null);
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </GsapPresence>
                    );
                })()}

                {restoreConflict && (
                    <GsapPresence preset="banner" className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl shrink-0">
                        <p className="text-sm font-bold text-amber-900">พบรายการชนกัน {restoreConflict.conflicts.length} จุด</p>
                        <p className="mt-1 text-xs text-amber-800">
                            เลือกวิธีการกู้คืน: ข้ามรายการที่ชน หรือแทนที่เวรปัจจุบันด้วยเวรจากเวอร์ชันที่เลือก
                        </p>
                        <div className="mt-2 max-h-24 overflow-auto rounded-lg bg-white/70 border border-amber-200 p-2 text-[11px] text-amber-900 space-y-1">
                            {restoreConflict.conflicts.slice(0, 6).map((item, idx) => (
                                <p key={`${item.date}-${item.level}-${idx}`}>
                                    {item.date} [{item.level}] {item.existingPersonId} → {item.incomingPersonId}
                                </p>
                            ))}
                            {restoreConflict.conflicts.length > 6 && (
                                <p>...และอีก {restoreConflict.conflicts.length - 6} รายการ</p>
                            )}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={async () => { await onResolveRestoreConflict('skip'); }}
                                disabled={restoreLoading}
                                className="flex-1 px-3 py-2 text-xs font-bold border border-amber-300 text-amber-900 rounded-xl hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                                ข้ามรายการที่ชน
                            </button>
                            <button
                                onClick={async () => { await onResolveRestoreConflict('overwrite'); }}
                                disabled={restoreLoading}
                                className="flex-1 px-3 py-2 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                                แทนที่เวรเดิม
                            </button>
                        </div>
                    </GsapPresence>
                )}

                {restoreResult && (
                    <GsapPresence preset="banner" className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shrink-0">
                        <p className="text-sm font-bold text-emerald-900">กู้คืนตารางเวรเรียบร้อย</p>
                        {(restoreResult.restoredPeopleCount + restoreResult.restoredShiftCount + restoreResult.overwrittenCount) === 0 ? (
                            <p className="mt-1 text-xs text-emerald-800">ไม่พบรายการที่ต้องกู้คืนเพิ่มเติม</p>
                        ) : (
                            <div className="mt-1 space-y-1 text-xs text-emerald-800">
                                <p>เพิ่มบุคลากรกลับมา {restoreResult.restoredPeopleCount} คน</p>
                                <p>กู้คืนเวร {restoreResult.restoredShiftCount} รายการ ในเดือน {restoreResult.monthKey}</p>
                                {restoreResult.skippedConflictCount > 0 && (
                                    <p>ข้ามรายการที่ชนกัน {restoreResult.skippedConflictCount} รายการ</p>
                                )}
                                {restoreResult.overwrittenCount > 0 && (
                                    <p>แทนที่เวรเดิม {restoreResult.overwrittenCount} รายการ</p>
                                )}
                            </div>
                        )}
                        <p className="mt-2 text-[11px] text-emerald-700">ตรวจสอบได้ทันทีใน Calendar และ Excel View</p>
                        <div className="mt-3 flex justify-end">
                            <button
                                onClick={onDismissRestoreResult}
                                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </GsapPresence>
                )}
            </GsapPresence>
        </div>
    );
}
