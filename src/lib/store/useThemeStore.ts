import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'classic-5-1' | 'cool-slate' | 'warm-paper' | 'forest-dusk' | 'midnight';

export interface ThemeMeta {
    id: ThemeId;
    label: string;
    description: string;
    preview: {
        page: string;
        surface: string;
        accent: string;
        text: string;
    };
}

export const THEMES: ThemeMeta[] = [
    {
        id: 'classic-5-1',
        label: 'Emerald Classic',
        description: 'Original v5.1 — warm off-white + emerald accents',
        preview: { page: '#fbfaf8', surface: '#fdfdfc', accent: '#10b981', text: '#2b2a28' },
    },
    {
        id: 'cool-slate',
        label: 'Cool Slate',
        description: 'Blue-grey professional palette',
        preview: { page: '#f0f4f8', surface: '#f8fafc', accent: '#dbeafe', text: '#1e293b' },
    },
    {
        id: 'warm-paper',
        label: 'Warm Paper',
        description: 'Warm cream tones — classic look',
        preview: { page: '#ffeedb', surface: '#fff7ed', accent: '#e1f1e4', text: '#2e241a' },
    },
    {
        id: 'forest-dusk',
        label: 'Forest Dusk',
        description: 'Deep emerald and sage earth tones',
        preview: { page: '#ecf5f0', surface: '#f0faf4', accent: '#d1fae5', text: '#1a2e22' },
    },
    {
        id: 'midnight',
        label: 'Midnight',
        description: 'Dark mode with amber accents',
        preview: { page: '#0f1419', surface: '#1a2332', accent: '#2a3a4a', text: '#e2e8f0' },
    },
];

interface ThemeState {
    themeId: ThemeId;
    setThemeId: (id: ThemeId) => void;
}

function applyThemeToDOM(id: ThemeId) {
    const html = document.documentElement;
    // Every theme sets data-theme (including classic-5-1 the default)
    html.setAttribute('data-theme', id);
}

export const useThemeStore = create<ThemeState>()(persist(
    (set) => ({
        themeId: 'classic-5-1',
        setThemeId: (id) => {
            applyThemeToDOM(id);
            set({ themeId: id });
        },
    }),
    {
        name: 'wayne_theme_v1',
        onRehydrateStorage: () => (state) => {
            // Apply theme immediately on hydration
            applyThemeToDOM(state?.themeId ?? 'classic-5-1');
        },
    },
));
