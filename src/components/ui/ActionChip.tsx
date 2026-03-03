import React from 'react';
import type { GlassVariant, SemanticMode, SlotId, SurfaceVariant, IntentVariant, DensityVariant } from './types';
import { getCombinedSemanticTokens, getTagThemeId } from '../../features/shared/semanticColors';

interface ActionChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
    variant?: GlassVariant;
    slotId?: SlotId;
    semanticMode?: SemanticMode;
    accentTags?: string[];
    tagIds?: string[];
    subsetId?: string | null;
    miniLegend?: boolean;
    surface?: SurfaceVariant;
    intent?: IntentVariant;
    density?: DensityVariant;
    title?: string;
}

export default function ActionChip({
    children,
    className = '',
    variant,
    slotId,
    semanticMode,
    accentTags,
    tagIds = [],
    subsetId,
    miniLegend = false,
    surface = 'base',
    intent = 'neutral',
    density = 'compact',
    ...rest
}: ActionChipProps) {
    const tokens = getCombinedSemanticTokens({ slot: slotId, tagIds, subsetId });
    const resolvedVariant = variant || tokens.chipVariant;
    const mode = semanticMode || tokens.mode;
    const accents = (accentTags && accentTags.length > 0)
        ? accentTags.map((tagId) => getTagThemeId(tagId))
        : tokens.accentThemes;

    const surfaceClass = surface === 'raised' ? 'ui-panel-raised' : surface === 'subtle' ? 'ui-panel-subtle' : 'ui-panel';
    const intentClass = intent === 'accent'
        ? 'ui-btn-accent'
        : intent === 'success'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : intent === 'warning'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : intent === 'danger'
                    ? 'ui-btn-danger'
                    : 'ui-btn-neutral';
    const densityClass = density === 'comfortable' ? 'px-3 py-2 text-[11px]' : 'px-2.5 py-1.5 text-[10px]';

    return (
        <button
            {...rest}
            data-ui-action
            className={`glass-chip glass-chip--${resolvedVariant} ui-btn ${surfaceClass} ${intentClass} ${densityClass} relative z-0 inline-flex items-center justify-center gap-1.5 rounded-xl transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 ${tokens.ring} ${mode === 'mixed' ? 'semantic-mixed-chip' : ''} ${className}`.trim()}
            style={{ ...(rest.style || {}), ...tokens.stripeCss }}
        >
            {miniLegend && (mode === 'mixed' || accents.length > 0) ? (
                <span className="semantic-mini-legend" aria-hidden="true">
                    {(accents.length > 0 ? accents : [tokens.baseTone]).slice(0, 2).map((theme, index) => (
                        <span key={`${theme}-${index}`} className={`semantic-mini-dot semantic-mini-dot--${theme}`} />
                    ))}
                </span>
            ) : null}
            {children}
        </button>
    );
}
