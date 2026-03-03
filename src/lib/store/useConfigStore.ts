import { create } from 'zustand';
import { Holiday, Tag, ScheduleVersion } from '../shiftplan/types';
import type { WorkspaceSchedulingConfig } from '../scheduling/types';

export const THAI_HOLIDAYS: Holiday[] = [
    // 2025
    { date: '2025-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2025-02-12', name: 'วันมาฆบูชา' },
    { date: '2025-04-06', name: 'วันจักรี' },
    { date: '2025-04-13', name: 'วันสงกรานต์' },
    { date: '2025-04-14', name: 'วันสงกรานต์' },
    { date: '2025-04-15', name: 'วันสงกรานต์' },
    { date: '2025-04-16', name: 'ชดเชยวันสงกรานต์' },
    { date: '2025-05-01', name: 'วันแรงงาน' },
    { date: '2025-05-04', name: 'วันฉัตรมงคล' },
    { date: '2025-05-05', name: 'ชดเชยวันฉัตรมงคล' },
    { date: '2025-05-11', name: 'วันพืชมงคล' },
    { date: '2025-06-03', name: 'วันเฉลิมฯ พระราชินี' },
    { date: '2025-07-28', name: 'วันเฉลิมฯ ร.10' },
    { date: '2025-08-12', name: 'วันแม่แห่งชาติ' },
    { date: '2025-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
    { date: '2025-10-23', name: 'วันปิยมหาราช' },
    { date: '2025-12-05', name: 'วันพ่อแห่งชาติ' },
    { date: '2025-12-10', name: 'วันรัฐธรรมนูญ' },
    { date: '2025-12-31', name: 'วันสิ้นปี' },
    // 2026
    { date: '2026-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2026-03-03', name: 'วันมาฆบูชา' },
    { date: '2026-04-06', name: 'วันจักรี' },
    { date: '2026-04-13', name: 'วันสงกรานต์' },
    { date: '2026-04-14', name: 'วันสงกรานต์' },
    { date: '2026-04-15', name: 'วันสงกรานต์' },
    { date: '2026-05-01', name: 'วันแรงงาน' },
    { date: '2026-05-04', name: 'วันฉัตรมงคล' },
    { date: '2026-05-31', name: 'วันวิสาขบูชา' },
    { date: '2026-06-03', name: 'วันเฉลิมพระชนมพรรษา พระราชินี' },
    { date: '2026-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
    { date: '2026-07-29', name: 'วันอาสาฬหบูชา' },
    { date: '2026-07-30', name: 'วันเข้าพรรษา' },
    { date: '2026-08-12', name: 'วันแม่แห่งชาติ' },
    { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
    { date: '2026-10-23', name: 'วันปิยมหาราช' },
    { date: '2026-12-05', name: 'วันพ่อแห่งชาติ' },
    { date: '2026-12-07', name: 'ชดเชยวันพ่อแห่งชาติ' },
    { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' },
    { date: '2026-12-31', name: 'วันสิ้นปี' },
];

interface ConfigState {
    holidays: Holiday[];
    tags: Tag[]; // Dynamic tags instead of roles
    versions: ScheduleVersion[];
    schedulingConfig: WorkspaceSchedulingConfig | null;
    setHolidays: (holidays: Holiday[]) => void;
    setTags: (tags: Tag[]) => void;
    addVersion: (v: ScheduleVersion) => void;
    setVersions: (versions: ScheduleVersion[]) => void;
    removeVersion: (id: string) => void;
    setSchedulingConfig: (config: WorkspaceSchedulingConfig | null) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
    holidays: THAI_HOLIDAYS,
    tags: [],
    versions: [],
    schedulingConfig: null,
    setHolidays: (holidays) => set({ holidays }),
    setTags: (tags) => set({ tags }),
    addVersion: (v) => set((s) => ({ versions: [...s.versions, v] })),
    setVersions: (versions) => set({ versions }),
    removeVersion: (id) => set((s) => ({ versions: s.versions.filter(v => v.id !== id) })),
    setSchedulingConfig: (config) => set({ schedulingConfig: config }),
}));
