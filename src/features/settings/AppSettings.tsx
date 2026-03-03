import React from 'react';
import {
    Bell,
    Check,
    Database,
    Download,
    HardDrive,
    Info,
    Moon,
    Palette,
    RefreshCw,
    Settings2,
    Shield,
    Sun,
    Trees,
    Upload,
} from 'lucide-react';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { useThemeStore, THEMES, type ThemeId } from '../../lib/store/useThemeStore';
import { useUIStore } from '../../lib/store/useUIStore';

const STORAGE_KEY = 'wayne_app_settings_v1';
const APP_VERSION = 'v5.3.1';

type SettingKey = 'compactSidebar' | 'showHints' | 'notifyPreview' | 'animationLevel' | 'defaultView';

interface AppSettingsState {
    compactSidebar: boolean;
    showHints: boolean;
    notifyPreview: boolean;
    animationLevel: 'full' | 'reduced' | 'none';
    defaultView: 'calendar' | 'excel';
}

const DEFAULT_SETTINGS: AppSettingsState = {
    compactSidebar: false,
    showHints: true,
    notifyPreview: true,
    animationLevel: 'full',
    defaultView: 'calendar',
};

function parseAnimationLevel(value: unknown): AppSettingsState['animationLevel'] {
    return value === 'full' || value === 'reduced' || value === 'none'
        ? value
        : DEFAULT_SETTINGS.animationLevel;
}

function parseDefaultView(value: unknown): AppSettingsState['defaultView'] {
    return value === 'calendar' || value === 'excel'
        ? value
        : DEFAULT_SETTINGS.defaultView;
}

function loadSettings(): AppSettingsState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<AppSettingsState>;
        return {
            compactSidebar: parsed.compactSidebar ?? DEFAULT_SETTINGS.compactSidebar,
            showHints: parsed.showHints ?? DEFAULT_SETTINGS.showHints,
            notifyPreview: parsed.notifyPreview ?? DEFAULT_SETTINGS.notifyPreview,
            animationLevel: parseAnimationLevel(parsed.animationLevel),
            defaultView: parseDefaultView(parsed.defaultView),
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function estimateLocalStorageUsage(): string {
    try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                total += key.length + (localStorage.getItem(key)?.length || 0);
            }
        }
        const kb = (total * 2) / 1024; // UTF-16 encoding
        if (kb < 1) return `${Math.round(total * 2)} bytes`;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(2)} MB`;
    } catch {
        return 'Unknown';
    }
}

function getThemeIcon(id: ThemeId) {
    switch (id) {
        case 'classic-5-1': return <Trees className="w-4 h-4" />;
        case 'warm-paper': return <Sun className="w-4 h-4" />;
        case 'cool-slate': return <Settings2 className="w-4 h-4" />;
        case 'forest-dusk': return <Trees className="w-4 h-4" />;
        case 'midnight': return <Moon className="w-4 h-4" />;
    }
}

export default function AppSettings() {
    const pageGradient = getGradientRecipe('rules', 'page-bg');
    const [settings, setSettings] = React.useState<AppSettingsState>(() => loadSettings());
    const { themeId, setThemeId } = useThemeStore();
    const {
        tableDensity,
        setTableDensity,
        weekendHighlight,
        setWeekendHighlight,
        dimPastDays,
        setDimPastDays,
    } = useUIStore();
    const [storageUsage, setStorageUsage] = React.useState(() => estimateLocalStorageUsage());
    const [exportMessage, setExportMessage] = React.useState<string | null>(null);
    const [importMessage, setImportMessage] = React.useState<string | null>(null);
    const importRef = React.useRef<HTMLInputElement>(null);

    const setValue = <K extends SettingKey>(key: K, value: AppSettingsState[K]) => {
        const next = { ...settings, [key]: value };
        setSettings(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const resetDefaults = () => {
        setSettings(DEFAULT_SETTINGS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
        setThemeId('classic-5-1');
    };

    const clearCache = () => {
        const preserveKeys = ['wayne_editor_password', 'wayne_theme_v1', 'wayne-ui-store', STORAGE_KEY];
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !preserveKeys.includes(key)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        setStorageUsage(estimateLocalStorageUsage());
        setExportMessage(`Cleared ${keysToRemove.length} cached items.`);
        setTimeout(() => setExportMessage(null), 3000);
    };

    const exportSettings = () => {
        const data: Record<string, unknown> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('wayne')) {
                try { data[key] = JSON.parse(localStorage.getItem(key)!); }
                catch { data[key] = localStorage.getItem(key); }
            }
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wayne-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportMessage('Settings exported.');
        setTimeout(() => setExportMessage(null), 3000);
    };

    const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (typeof data !== 'object' || data === null) throw new Error('Invalid format');
                let count = 0;
                for (const [key, value] of Object.entries(data)) {
                    if (key.startsWith('wayne')) {
                        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                        count++;
                    }
                }
                setSettings(loadSettings());
                setStorageUsage(estimateLocalStorageUsage());
                setImportMessage(`Imported ${count} settings. Refresh may be needed for full effect.`);
                setTimeout(() => setImportMessage(null), 5000);
            } catch {
                setImportMessage('Failed to import — invalid file format.');
                setTimeout(() => setImportMessage(null), 4000);
            }
        };
        reader.readAsText(file);
        if (importRef.current) importRef.current.value = '';
    };

    const ToggleRow = ({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) => (
        <label className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition-all hover:shadow-sm" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
            <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>{label}</span>
                {description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--ui-text-muted)' }}>{description}</p>}
            </div>
            <div className="relative ml-3 shrink-0">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
                <div className="w-10 h-6 rounded-full transition-colors peer-checked:bg-emerald-500" style={{ background: checked ? undefined : 'var(--ui-border)' }}></div>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} style={{ background: 'var(--ui-surface-raised)' }}></div>
            </div>
        </label>
    );

    return (
        <div className="ui-page-root h-full min-h-0 p-4 md:p-6 flex flex-col gap-5 overflow-auto" style={{ background: pageGradient.background }}>
            {/* Header */}
            <section className="rounded-2xl px-5 py-4" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                <h1 className="text-xl caps-title flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                    <Settings2 className="w-5 h-5" style={{ color: 'var(--ui-holiday-date-text)' }} />
                    Settings
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--ui-text-secondary)' }}>Personal app preferences stored on this device.</p>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {/* Left column */}
                <div className="xl:col-span-8 flex flex-col gap-5">
                    {/* Theme Section */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Palette className="w-4 h-4" style={{ color: 'var(--ui-holiday-date-text)' }} />
                            Theme
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ui-text-muted)' }}>Choose your preferred color theme. Applies instantly across the entire app.</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {THEMES.map(theme => {
                                const isActive = themeId === theme.id;
                                return (
                                    <button
                                        key={theme.id}
                                        onClick={() => setThemeId(theme.id)}
                                        className={`relative group rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${isActive ? 'ring-2 ring-emerald-500 shadow-md' : 'hover:shadow-md'}`}
                                        style={{
                                            background: 'var(--ui-surface-raised)',
                                            border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.4)' : 'var(--ui-border)'}`,
                                        }}
                                    >
                                        {/* Color swatches */}
                                        <div className="flex gap-1.5 mb-3">
                                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ background: theme.preview.page, border: '1px solid rgba(0,0,0,0.08)' }} />
                                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ background: theme.preview.surface, border: '1px solid rgba(0,0,0,0.08)' }} />
                                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ background: theme.preview.accent, border: '1px solid rgba(0,0,0,0.08)' }} />
                                            <div className="w-4 h-6 rounded-lg" style={{ background: theme.preview.text }} />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="shrink-0 opacity-60">{getThemeIcon(theme.id)}</span>
                                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--ui-text-primary)' }}>{theme.label}</span>
                                        </div>
                                        <p className="text-[11px] mt-0.5 leading-tight" style={{ color: 'var(--ui-text-muted)' }}>{theme.description}</p>
                                        {isActive && (
                                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Appearance & Density Section */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Settings2 className="w-4 h-4 text-indigo-500" />
                            Professional Settings
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ui-text-muted)' }}>Customize the workspace density and highlighting layers.</p>
                        <div className="space-y-2.5">
                            {/* Table Density */}
                            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                                <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>Table Density</span>
                                <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--ui-text-muted)' }}>Adjust spreadsheet cell padding and typography</p>
                                <div className="flex gap-2">
                                    {(['comfortable', 'compact'] as const).map(density => {
                                        return (
                                            <button
                                                key={density}
                                                onClick={() => setTableDensity(density)}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${tableDensity === density ? 'ring-2 ring-emerald-500 shadow-sm' : ''}`}
                                                style={{
                                                    background: tableDensity === density ? 'var(--ui-success-soft)' : 'var(--ui-surface-subtle)',
                                                    color: tableDensity === density ? 'var(--ui-text-primary)' : 'var(--ui-text-muted)',
                                                    border: '1px solid var(--ui-border)',
                                                }}
                                            >
                                                {density}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Weekend/Holiday Highlight */}
                            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                                <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>Weekend / Holiday Highlight</span>
                                <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--ui-text-muted)' }}>Control how days off are emphasized in spreadsheets</p>
                                <div className="flex gap-2">
                                    {(['full', 'subtle', 'none'] as const).map(level => {
                                        return (
                                            <button
                                                key={level}
                                                onClick={() => setWeekendHighlight(level)}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${weekendHighlight === level ? 'ring-2 ring-emerald-500 shadow-sm' : ''}`}
                                                style={{
                                                    background: weekendHighlight === level ? 'var(--ui-success-soft)' : 'var(--ui-surface-subtle)',
                                                    color: weekendHighlight === level ? 'var(--ui-text-primary)' : 'var(--ui-text-muted)',
                                                    border: '1px solid var(--ui-border)',
                                                }}
                                            >
                                                {level === 'full' ? 'Full Row' : level === 'subtle' ? 'Text Only' : 'Hidden'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Dim Past Days */}
                            <label className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition-all hover:shadow-sm" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>Dim Past Days</span>
                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ui-text-muted)' }}>Automatically lower the opacity of dates before today to focus on upcoming shifts</p>
                                </div>
                                <div className="relative ml-3 shrink-0">
                                    <input type="checkbox" checked={dimPastDays} onChange={(e) => setDimPastDays(e.target.checked)} className="sr-only peer" />
                                    <div className="w-10 h-6 rounded-full transition-colors peer-checked:bg-emerald-500" style={{ background: dimPastDays ? undefined : 'var(--ui-border)' }}></div>
                                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-sm transition-transform ${dimPastDays ? 'translate-x-4' : ''}`} style={{ background: 'var(--ui-surface-raised)' }}></div>
                                </div>
                            </label>
                        </div>
                    </section>

                    {/* Experience Section */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Settings2 className="w-4 h-4 text-indigo-500" />
                            Experience
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ui-text-muted)' }}>Customize how the app looks and behaves.</p>
                        <div className="space-y-2.5">
                            <ToggleRow label="Compact sidebar by default" checked={settings.compactSidebar} onChange={(v) => setValue('compactSidebar', v)} description="Start with the sidebar collapsed on each session" />
                            <ToggleRow label="Show helper hints" checked={settings.showHints} onChange={(v) => setValue('showHints', v)} description="Display contextual tips throughout the app" />
                            <ToggleRow label="Preview-mode reminder banners" checked={settings.notifyPreview} onChange={(v) => setValue('notifyPreview', v)} description="Show read-only warning in preview environments" />

                            {/* Animation Level */}
                            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                                <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>Animation level</span>
                                <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--ui-text-muted)' }}>Controls GSAP and micro-animations</p>
                                <div className="flex gap-2">
                                    {(['full', 'reduced', 'none'] as const).map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setValue('animationLevel', level)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${settings.animationLevel === level ? 'ring-2 ring-emerald-500 shadow-sm' : ''}`}
                                            style={{
                                                background: settings.animationLevel === level ? 'var(--ui-success-soft)' : 'var(--ui-surface-subtle)',
                                                color: settings.animationLevel === level ? 'var(--ui-text-primary)' : 'var(--ui-text-muted)',
                                                border: '1px solid var(--ui-border)',
                                            }}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Default Calendar View */}
                            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--ui-surface-raised)', border: '1px solid var(--ui-border)' }}>
                                <span className="text-sm font-medium" style={{ color: 'var(--ui-text-primary)' }}>Default calendar view</span>
                                <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--ui-text-muted)' }}>Initial view when opening the schedule</p>
                                <div className="flex gap-2">
                                    {(['calendar', 'excel'] as const).map(view => (
                                        <button
                                            key={view}
                                            onClick={() => setValue('defaultView', view)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${settings.defaultView === view ? 'ring-2 ring-emerald-500 shadow-sm' : ''}`}
                                            style={{
                                                background: settings.defaultView === view ? 'var(--ui-success-soft)' : 'var(--ui-surface-subtle)',
                                                color: settings.defaultView === view ? 'var(--ui-text-primary)' : 'var(--ui-text-muted)',
                                                border: '1px solid var(--ui-border)',
                                            }}
                                        >
                                            {view === 'calendar' ? '📅 Calendar' : '📊 Spreadsheet'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right column */}
                <div className="xl:col-span-4 flex flex-col gap-5">
                    {/* Data & Storage */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Database className="w-4 h-4 text-amber-500" />
                            Data & Storage
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ui-text-muted)' }}>Manage app data stored in your browser.</p>

                        {/* Storage indicator */}
                        <div className="rounded-xl px-4 py-3 mb-3" style={{ background: 'var(--ui-surface-subtle)', border: '1px solid var(--ui-border)' }}>
                            <div className="flex items-center gap-2">
                                <HardDrive className="w-3.5 h-3.5" style={{ color: 'var(--ui-text-muted)' }} />
                                <span className="text-[12px] font-medium" style={{ color: 'var(--ui-text-secondary)' }}>localStorage usage</span>
                            </div>
                            <p className="text-lg font-bold mt-1" style={{ color: 'var(--ui-text-primary)' }}>{storageUsage}</p>
                        </div>

                        <div className="space-y-2">
                            <button
                                onClick={clearCache}
                                className="ui-btn ui-btn-warning w-full px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Clear cached data
                            </button>
                            <button
                                onClick={exportSettings}
                                className="ui-btn ui-btn-info w-full px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export settings
                            </button>
                            <button
                                onClick={() => importRef.current?.click()}
                                className="ui-btn ui-btn-neutral w-full px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                Import settings
                            </button>
                            <input ref={importRef} type="file" accept=".json" onChange={importSettings} className="hidden" />
                        </div>
                        {exportMessage && (
                            <p className="text-[11px] font-medium mt-2 px-1" style={{ color: 'var(--ui-holiday-date-text)' }}>{exportMessage}</p>
                        )}
                        {importMessage && (
                            <p className="text-[11px] font-medium mt-2 px-1" style={{ color: 'var(--ui-text-secondary)' }}>{importMessage}</p>
                        )}
                    </section>

                    {/* About Section */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Info className="w-4 h-4 text-sky-500" />
                            About
                        </h2>

                        <div className="space-y-2 mt-3">
                            <div className="flex justify-between items-center text-sm">
                                <span style={{ color: 'var(--ui-text-secondary)' }}>App</span>
                                <span className="font-bold" style={{ color: 'var(--ui-text-primary)' }}>Wayne Duty Management</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span style={{ color: 'var(--ui-text-secondary)' }}>Version</span>
                                <span className="font-bold text-emerald-600">{APP_VERSION}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span style={{ color: 'var(--ui-text-secondary)' }}>Theme</span>
                                <span className="font-medium capitalize" style={{ color: 'var(--ui-text-primary)' }}>{themeId.replace('-', ' ')}</span>
                            </div>
                        </div>

                        <a
                            href="/changelog"
                            className="ui-btn ui-btn-accent w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center transition-all hover:scale-[1.01] active:scale-[0.99] no-underline"
                        >
                            View Changelog
                        </a>
                    </section>

                    {/* Safety / Reset */}
                    <section className="ui-panel rounded-xl p-5">
                        <h2 className="text-sm caps-title mb-1 flex items-center gap-2" style={{ color: 'var(--ui-text-primary)' }}>
                            <Shield className="w-4 h-4 text-rose-500" />
                            Safety
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ui-text-muted)' }}>Settings are stored in local storage and affect only this device.</p>

                        <button
                            onClick={resetDefaults}
                            className="ui-btn ui-btn-danger w-full px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                            Reset all settings to defaults
                        </button>

                        <div className="mt-3 rounded-xl px-3 py-2.5 text-[11px] flex items-start gap-2" style={{ background: 'var(--ui-info-soft)', border: '1px solid var(--ui-border)', color: 'var(--ui-text-secondary)' }}>
                            <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>Resetting will revert theme to Warm Paper and all toggles to defaults. Passwords are not affected.</span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
