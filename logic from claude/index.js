/**
 * ═══════════════════════════════════════════════════════════════
 *  SHIFTPLAN LIB — BARREL EXPORT
 *  Import everything from one place:
 *
 *    import { solve, saveSchedule, ROLES, monthKey } from "@/lib";
 *
 * ═══════════════════════════════════════════════════════════════
 */

// Core domain constants + constraint weights
export {
  ROLES,
  ROLE_ORDER,
  ELI_1ST,
  ELI_2ND,
  ELI_3RD,
  W,
  R1SIR_MAX,
  R3SIR_TOTAL,
  SA,
  THAI_HOLIDAYS,
  MONTHS,
  DAY_TH,
} from "./constants";

// Date / calendar utilities
export {
  getDaysInMonth,
  getFirstDayOfWeek,
  isWeekend,
  getWeekendSet,
  getThaiHolidays,
  getThaiHolidayMap,
  isThaiHoliday,
  monthKey,
  serializeForFirestore,
  deserializeFromFirestore,
  formatMonthYear,
  getToday,
  isToday,
} from "./dateUtils";

// Firebase / Firestore operations
export { db } from "./firebase";
export {
  subscribeMembers,
  saveMembers,
  subscribeConfig,
  saveConfig,
  subscribeSchedule,
  saveSchedule,
  subscribeAll,
} from "./firestore";

// SA Solver engine
export { solve } from "./solver";
