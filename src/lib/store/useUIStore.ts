import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    selectedDate: Date | null;
    viewMode: 'calendar' | 'excel';

    // Auth & Permission State
    showPasswordModal: boolean;
    isAuthenticated: boolean;
    isEditor: boolean; // true = full editor, false = guest (view-only)
    isPreviewReadonly: boolean;
    previewMessage: string;
    canMutate: boolean;

    // Workspace State
    selectedWorkspaceId: string;

    // UI Interaction State
    expandedSections: Record<string, boolean>;
    draggedPersonId: string | null;

    // Professional Settings
    tableDensity: 'comfortable' | 'compact';
    weekendHighlight: 'full' | 'subtle' | 'none';
    dimPastDays: boolean;
    isMobileDockCollapsed: boolean;
    mobileActivePanel: 'calendar' | 'personnel' | 'rules' | 'cumulative' | 'settings' | null;
    lastFocusedDay: string | null;

    // Actions
    setSelectedDate: (date: Date | null) => void;
    setViewMode: (mode: 'calendar' | 'excel') => void;
    setShowPasswordModal: (show: boolean) => void;
    setIsAuthenticated: (auth: boolean) => void;
    setIsEditor: (editor: boolean) => void;
    setPreviewStatus: (readonly: boolean, message?: string) => void;
    setSelectedWorkspaceId: (workspaceId: string) => void;
    setExpandedSections: (sections: Record<string, boolean>) => void;
    setDraggedPersonId: (id: string | null) => void;
    setTableDensity: (density: 'comfortable' | 'compact') => void;
    setWeekendHighlight: (level: 'full' | 'subtle' | 'none') => void;
    setDimPastDays: (dim: boolean) => void;
    setIsMobileDockCollapsed: (collapsed: boolean) => void;
    setMobileActivePanel: (panel: UIState['mobileActivePanel']) => void;
    setLastFocusedDay: (day: string | null) => void;
}

export const useUIStore = create<UIState>()(persist((set) => ({
    selectedDate: null,
    viewMode: 'calendar',

    showPasswordModal: false,
    isAuthenticated: false,
    isEditor: false,
    isPreviewReadonly: false,
    previewMessage: '',
    canMutate: false,

    selectedWorkspaceId: 'default',
    expandedSections: { first: true, others: true, both: true },
    draggedPersonId: null,

    tableDensity: 'comfortable',
    weekendHighlight: 'full',
    dimPastDays: false,
    isMobileDockCollapsed: false,
    mobileActivePanel: null,
    lastFocusedDay: null,

    setSelectedDate: (date) => set({ selectedDate: date }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setShowPasswordModal: (show) => set({ showPasswordModal: show }),
    setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),
    setIsEditor: (editor) => set((state) => ({ isEditor: editor, canMutate: editor && !state.isPreviewReadonly })),
    setPreviewStatus: (readonly, message = '') =>
        set((state) => ({ isPreviewReadonly: readonly, previewMessage: message, canMutate: state.isEditor && !readonly })),
    setSelectedWorkspaceId: (workspaceId) => set({ selectedWorkspaceId: workspaceId || 'default' }),
    setExpandedSections: (sections) => set({ expandedSections: sections }),
    setDraggedPersonId: (id) => set({ draggedPersonId: id }),
    setTableDensity: (density) => set({ tableDensity: density }),
    setWeekendHighlight: (level) => set({ weekendHighlight: level }),
    setDimPastDays: (dim) => set({ dimPastDays: dim }),
    setIsMobileDockCollapsed: (collapsed) => set({ isMobileDockCollapsed: collapsed }),
    setMobileActivePanel: (panel) => set({ mobileActivePanel: panel }),
    setLastFocusedDay: (day) => set({ lastFocusedDay: day }),
}), {
    name: 'wayne-ui-store',
    partialize: (state) => ({
        isEditor: state.isEditor,
        selectedWorkspaceId: state.selectedWorkspaceId,
        tableDensity: state.tableDensity,
        weekendHighlight: state.weekendHighlight,
        dimPastDays: state.dimPastDays,
        isMobileDockCollapsed: state.isMobileDockCollapsed,
        mobileActivePanel: state.mobileActivePanel,
        lastFocusedDay: state.lastFocusedDay,
    }),
    merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<UIState>) };
        return {
            ...merged,
            isAuthenticated: false,
            isEditor: false,
            canMutate: false,
        } as UIState;
    },
}));
