import type { TagThemeId, SemanticMode, SlotId } from '../../features/shared/semanticColors';

export type { TagThemeId, SemanticMode, SlotId };

export type GlassVariant = 'neutral' | 'blue' | 'violet' | 'emerald' | 'fuchsia' | 'rose' | 'amber' | 'red' | 'indigo';
export type SurfaceVariant = 'base' | 'raised' | 'subtle';
export type IntentVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type DensityVariant = 'compact' | 'comfortable';

export interface SemanticProps {
    semanticMode?: SemanticMode;
    accentTags?: string[];
    slotId?: SlotId;
    miniLegend?: boolean;
    surface?: SurfaceVariant;
    intent?: IntentVariant;
    density?: DensityVariant;
}
