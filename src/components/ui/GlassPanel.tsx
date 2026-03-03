import React from 'react';
import type { SlotId, SurfaceVariant } from './types';
import { getCombinedSemanticTokens } from '../../features/shared/semanticColors';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    slotId?: SlotId;
    tagIds?: string[];
    subsetId?: string | null;
    semanticMode?: 'single' | 'mixed';
    surface?: SurfaceVariant;
}

export default function GlassPanel({ className = '', slotId, tagIds = [], subsetId, semanticMode, surface = 'base', ...rest }: GlassPanelProps) {
    const tokens = getCombinedSemanticTokens({ slot: slotId, tagIds, subsetId });
    const mode = semanticMode || tokens.mode;
    const surfaceClass = surface === 'raised' ? 'ui-panel-raised' : surface === 'subtle' ? 'ui-panel-subtle' : 'ui-panel';
    return <div {...rest} className={`glass-panel ${surfaceClass} ${mode === 'mixed' ? 'semantic-mixed-chip' : ''} ${className}`.trim()} style={{ ...(rest.style || {}), ...tokens.stripeCss }} />;
}
