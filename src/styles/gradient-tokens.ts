export type GradientThemeKey = 'login' | 'shell' | 'calendar' | 'personnel' | 'rules' | 'cumulative' | 'changelog' | 'modal';

export type GradientSurfaceId =
  | 'page-bg'
  | 'hero-bg'
  | 'card-bg'
  | 'sidebar-bg'
  | 'sidebar-active'
  | 'sidebar-icon'
  | 'overlay-blob-a'
  | 'overlay-blob-b'
  | 'overlay-blob-c';

export interface GradientRecipe {
  background: string;
  border?: string;
  shadow?: string;
}

/**
 * All gradient recipes now reference CSS custom properties so they
 * automatically adapt when the active theme changes via `data-theme`.
 */
const RECIPES: Record<GradientThemeKey, Partial<Record<GradientSurfaceId, GradientRecipe>>> = {
  login: {
    'page-bg': { background: 'var(--ui-page)' },
    'overlay-blob-a': { background: 'rgba(0, 0, 0, 0)' },
    'overlay-blob-b': { background: 'rgba(0, 0, 0, 0)' },
    'overlay-blob-c': { background: 'rgba(0, 0, 0, 0)' },
    'hero-bg': { background: 'var(--ui-success-soft)' },
    'card-bg': { background: 'var(--ui-surface-raised)' },
  },
  shell: {
    'page-bg': { background: 'var(--ui-page)' },
    'sidebar-bg': {
      background: 'var(--ui-surface-base)',
      border: '1px solid var(--ui-border)',
      shadow: 'var(--nb-shadow-sm)',
    },
    'sidebar-active': {
      background: 'var(--ui-surface-raised)',
      shadow: 'var(--nb-shadow-sm)',
    },
    'sidebar-icon': {
      background: 'var(--ui-accent-soft)',
      shadow: 'var(--nb-shadow-sm)',
    },
  },
  changelog: {
    'page-bg': { background: 'var(--ui-page)' },
    'hero-bg': { background: 'var(--ui-surface-raised)' },
  },
  calendar: {
    'page-bg': { background: 'var(--ui-page)' },
    'card-bg': { background: 'var(--ui-surface-base)' },
  },
  personnel: {
    'page-bg': { background: 'var(--ui-page)' },
  },
  rules: {
    'page-bg': { background: 'var(--ui-page)' },
  },
  cumulative: {
    'page-bg': { background: 'var(--ui-page)' },
  },
  modal: {
    'card-bg': { background: 'var(--ui-surface-raised)' },
  },
};

const FALLBACK: GradientRecipe = { background: 'var(--ui-page)' };

export function getGradientRecipe(theme: GradientThemeKey, surface: GradientSurfaceId): GradientRecipe {
  return RECIPES[theme]?.[surface] || RECIPES.shell?.[surface] || FALLBACK;
}
