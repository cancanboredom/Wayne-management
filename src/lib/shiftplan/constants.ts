import { SubsetTag } from './types';

// Default subsets for backward compatibility and initial setup
export const DEFAULT_SUBSETS: SubsetTag[] = [
    {
        id: "intern", name: "Intern", color: "#f7c6d2", shape: "●",
        summaryGroupId: "intern",
        summaryGroupLabel: "Intern",
        summaryOrder: 1,
        displayNameFull: "Intern",
        eligible1st: true,
        maxShifts: 10,
        balanceGroup: true
    },
    {
        id: "r1sry", name: "R1 สระบุรี", color: "#fde8b0", shape: "◆",
        summaryGroupId: "r1sry",
        summaryGroupLabel: "R1 สระบุรี",
        summaryOrder: 2,
        displayNameFull: "R1 สระบุรี",
        eligible2nd: true,
        mutuallyExclusiveWith: "r1sir",
        balanceGroup: true
    },
    {
        id: "r1sir", name: "R1 ศิริราช", color: "#b8e8d8", shape: "★",
        summaryGroupId: "r1sir",
        summaryGroupLabel: "R1 ศิริราช",
        summaryOrder: 3,
        displayNameFull: "R1 ศิริราช",
        eligible1st: true,
        maxShifts: 6,
        balanceGroup: true
    },
    {
        id: "r2sry", name: "R2 สระบุรี", color: "#b8d4f8", shape: "■",
        summaryGroupId: "r2sry",
        summaryGroupLabel: "R2 สระบุรี",
        summaryOrder: 4,
        displayNameFull: "R2 สระบุรี",
        eligible2nd: true, eligible3rd: true
    },
    {
        id: "r3sry", name: "R3 สระบุรี", color: "#d4b8f8", shape: "▲",
        summaryGroupId: "r3sry",
        summaryGroupLabel: "R3 สระบุรี",
        summaryOrder: 5,
        displayNameFull: "R3 สระบุรี",
        eligible2nd: true, eligible3rd: true
    },
    {
        id: "r2sir", name: "R2 ศิริราช", color: "#c8e6ff", shape: "⬢",
        summaryGroupId: "r2sir",
        summaryGroupLabel: "R2 ศิริราช",
        summaryOrder: 6,
        displayNameFull: "R2 ศิริราช",
        eligible2nd: true, eligible3rd: true
    },
    {
        id: "r3sir", name: "R3 ศิริราช", color: "#f8d4b8", shape: "⬡",
        summaryGroupId: "r3sir",
        summaryGroupLabel: "R3 ศิริราช",
        summaryOrder: 7,
        displayNameFull: "R3 ศิริราช",
        eligible2nd: true, eligible3rd: true,
        exactShifts: 5,
        pullTag: "r1sir"
    },
    {
        id: "other", name: "Other", color: "#f3f4f6", shape: "○",
        summaryGroupId: "other",
        summaryGroupLabel: "Other",
        summaryOrder: 8,
        displayNameFull: "Other"
    }
];

// Constraint Weights
export const W = {
    OFF: 999_999,
    DUP: 999_999,
    CONSEC: 999_999,
    R1SIR_R1SRY: 999_999,
    R3SIR_TOTAL: 999_999,
    R1SIR_CAP: 8_000,
    BAL_2ND_POOL: 500,
    BAL_23_POOL: 200,
    BAL_INTERN: 60,
    BAL_R1SIR: 65,
    BAL_R1SRY: 50,
    NOON_BAL: 60,
    CONF_BAL: 50,
    R3SIR_PULL: 30,
    ALT_DAY: 15,
    CLUSTERING: 40, // Penalty for having too many shifts in a short window
};

// Solver parameters
export const SA = {
    ITERATIONS: 300_000,
    T0: 1_200,
    TMIN: 0.1,
};

export const SA_ROUNDS = 3;
export const LNS_ITERATIONS = 50_000;
export const CP_TIMEOUT_MS = 2000;

export const THAI_HOLIDAYS_DATA: Record<number, Record<number, { d: number; n: string }[]>> = {
    2024: {
        0: [{ d: 1, n: "วันขึ้นปีใหม่" }],
        1: [{ d: 24, n: "วันมาฆบูชา" }, { d: 26, n: "ชดเชยมาฆบูชา" }],
        3: [{ d: 6, n: "วันจักรี" }, { d: 8, n: "ชดเชยจักรี" },
        { d: 13, n: "สงกรานต์" }, { d: 14, n: "สงกรานต์" },
        { d: 15, n: "สงกรานต์" }, { d: 16, n: "ชดเชยสงกรานต์" }],
        4: [{ d: 1, n: "วันแรงงาน" }, { d: 4, n: "วันฉัตรมงคล" },
        { d: 6, n: "ชดเชยฉัตรมงคล" }, { d: 22, n: "วันวิสาขบูชา" }],
        5: [{ d: 3, n: "วันราชินี" }, { d: 4, n: "ชดเชยวันราชินี" }],
        6: [{ d: 28, n: "วันเฉลิมฯ ร.10" }, { d: 29, n: "ชดเชย ร.10" }],
        7: [{ d: 12, n: "วันแม่แห่งชาติ" }],
        9: [{ d: 13, n: "วันนวมินทรมหาราช" }, { d: 23, n: "วันปิยมหาราช" }],
        11: [{ d: 5, n: "วันพ่อแห่งชาติ" }, { d: 10, n: "วันรัฐธรรมนูญ" },
        { d: 31, n: "วันสิ้นปี" }],
    },
    2025: {
        0: [{ d: 1, n: "วันขึ้นปีใหม่" }],
        1: [{ d: 12, n: "วันมาฆบูชา" }],
        3: [{ d: 6, n: "วันจักรี" }, { d: 7, n: "ชดเชยจักรี" },
        { d: 13, n: "สงกรานต์" }, { d: 14, n: "สงกรานต์" }, { d: 15, n: "สงกรานต์" }],
        4: [{ d: 1, n: "วันแรงงาน" }, { d: 4, n: "ชดเชยแรงงาน" },
        { d: 5, n: "วันฉัตรมงคล" }, { d: 12, n: "วันวิสาขบูชา" }],
        5: [{ d: 2, n: "วันราชินี" }, { d: 3, n: "ชดเชยวันราชินี" }],
        6: [{ d: 28, n: "วันเฉลิมฯ ร.10" }, { d: 29, n: "ชดเชย ร.10" }],
        7: [{ d: 11, n: "วันหยุดพิเศษ" }, { d: 12, n: "วันแม่แห่งชาติ" }],
        9: [{ d: 13, n: "วันนวมินทรมหาราช" }, { d: 23, n: "วันปิยมหาราช" },
        { d: 24, n: "ชดเชยปิยมหาราช" }],
        11: [{ d: 5, n: "วันพ่อแห่งชาติ" }, { d: 8, n: "ชดเชยวันพ่อ" },
        { d: 10, n: "วันรัฐธรรมนูญ" }, { d: 31, n: "วันสิ้นปี" }],
    },
    2026: {
        0: [{ d: 1, n: "วันขึ้นปีใหม่" }, { d: 2, n: "ชดเชยขึ้นปีใหม่" }],
        2: [{ d: 2, n: "วันมาฆบูชา" }, { d: 3, n: "ชดเชยมาฆบูชา" }],
        3: [{ d: 6, n: "วันจักรี" },
        { d: 13, n: "สงกรานต์" }, { d: 14, n: "สงกรานต์" }, { d: 15, n: "สงกรานต์" }],
        4: [{ d: 1, n: "วันแรงงาน" }, { d: 4, n: "วันฉัตรมงคล" },
        { d: 31, n: "วันวิสาขบูชา" }],
        5: [{ d: 1, n: "วันราชินี" }, { d: 2, n: "ชดเชยวันราชินี" }],
        6: [{ d: 27, n: "ชดเชย ร.10" }, { d: 28, n: "วันเฉลิมฯ ร.10" }],
        7: [{ d: 12, n: "วันแม่แห่งชาติ" }],
        9: [{ d: 13, n: "วันนวมินทรมหาราช" }, { d: 23, n: "วันปิยมหาราช" }],
        11: [{ d: 5, n: "วันพ่อแห่งชาติ" }, { d: 7, n: "ชดเชยวันพ่อ" },
        { d: 10, n: "วันรัฐธรรมนูญ" }, { d: 31, n: "วันสิ้นปี" }],
    },
    2027: {
        0: [{ d: 1, n: "วันขึ้นปีใหม่" }],
        1: [{ d: 19, n: "วันมาฆบูชา" }, { d: 21, n: "ชดเชยมาฆบูชา" }],
        3: [{ d: 6, n: "วันจักรี" },
        { d: 13, n: "สงกรานต์" }, { d: 14, n: "สงกรานต์" }, { d: 15, n: "สงกรานต์" }],
        4: [{ d: 1, n: "วันแรงงาน" }, { d: 3, n: "ชดเชยแรงงาน" },
        { d: 4, n: "วันฉัตรมงคล" }, { d: 20, n: "วันวิสาขบูชา" }],
        5: [{ d: 1, n: "วันราชินี" }, { d: 2, n: "ชดเชยวันราชินี" }],
        6: [{ d: 26, n: "วันเฉลิมฯ ร.10" }, { d: 27, n: "ชดเชย ร.10" }],
        7: [{ d: 12, n: "วันแม่แห่งชาติ" }],
        9: [{ d: 13, n: "วันนวมินทรมหาราช" }, { d: 23, n: "วันปิยมหาราช" },
        { d: 25, n: "ชดเชยปิยมหาราช" }],
        11: [{ d: 5, n: "วันพ่อแห่งชาติ" }, { d: 7, n: "ชดเชยวันพ่อ" },
        { d: 10, n: "วันรัฐธรรมนูญ" }, { d: 31, n: "วันสิ้นปี" }],
    }
};

export const MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
