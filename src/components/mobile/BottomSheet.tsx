import React from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    className?: string;
    footer?: React.ReactNode;
}

export default function BottomSheet({
    open,
    onClose,
    title,
    subtitle,
    children,
    className = '',
    footer,
}: BottomSheetProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] md:hidden">
            <button
                aria-label="Close sheet"
                onClick={onClose}
                className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            />
            <div className={`absolute inset-x-0 bottom-0 rounded-t-3xl border border-gray-200 bg-white shadow-2xl max-h-[86vh] flex flex-col ${className}`}>
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gray-100">
                    <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-200" />
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            {title && <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>}
                            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto px-4 py-3">{children}</div>
                {footer && <div className="shrink-0 border-t border-gray-100 px-4 py-3 bg-white">{footer}</div>}
            </div>
        </div>
    );
}
