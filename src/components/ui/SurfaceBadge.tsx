import React from 'react';
import type { SlotId, SemanticMode, SurfaceVariant, IntentVariant, DensityVariant } from './types';
import { getCombinedSemanticTokens, getTagThemeId } from '../../features/shared/semanticColors';

interface SurfaceBadgeProps {
    children: React.ReactNode;
    className?: string;
    slotId?: SlotId;
    semanticMode?: SemanticMode;
    accentTags?: string[];
    tagIds?: string[];
    subsetId?: string | null;
    miniLegend?: boolean;
    surface?: SurfaceVariant;
    intent?: IntentVariant;
    density?: DensityVariant;
}

export default function SurfaceBadge({
    children,
    className = '',
    slotId,
    semanticMode,
    accentTags,
    tagIds = [],
    subsetId,
    miniLegend = false,
    surface = 'base',
    intent = 'neutral',
    density = 'compact',
}: SurfaceBadgeProps) {
    const tokens = getCombinedSemanticTokens({ slot: slotId, tagIds, subsetId });
    const mode = semanticMode || tokens.mode;
    const accents = (accentTags && accentTags.length > 0)
        ? accentTags.map((tagId) => getTagThemeId(tagId))
        : tokens.accentThemes;

    const surfaceClass = surface === 'raised' ? 'ui-panel-raised' : surface === 'subtle' ? 'ui-panel-subtle' : 'ui-panel';
    const intentClass = intent === 'accent'
        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
        : intent === 'success'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : intent === 'warning'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : intent === 'danger'
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : '';
    const densityClass = density === 'comfortable' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border ${surfaceClass} ${intentClass} ${densityClass} ${tokens.softBg} ${mode === 'mixed' ? 'semantic-mixed-chip' : ''} ${className}`.trim()}
            style={tokens.stripeCss}
        >
            {miniLegend && (mode === 'mixed' || accents.length > 0) ? (
                <span className="semantic-mini-legend" aria-hidden="true">
                    {(accents.length > 0 ? accents : [tokens.baseTone]).slice(0, 2).map((theme, index) => (
                        <span key={`${theme}-${index}`} className={`semantic-mini-dot semantic-mini-dot--${theme}`} />
                    ))}
                </span>
            ) : null}
            {children}
        </span>
    );
}
