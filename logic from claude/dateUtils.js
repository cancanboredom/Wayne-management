/**
 * ═══════════════════════════════════════════════════════════════
 *  SHIFTPLAN — DATE UTILITIES
 * ═══════════════════════════════════════════════════════════════
 *
 *  Pure functions — no side effects, no imports from other lib files.
 *  Safe to use in both browser and Node environments.
 */

import { THAI_HOLIDAYS } from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
//  BASIC DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Number of days in a given month
 * @param {number} year
 * @param {number} month  0-indexed (0 = January)
 */
export const getDaysInMonth = (year, month) =>
  new Date(year, month + 1, 0).getDate();

/**
 * Day-of-week for the 1st of the month (0=Sunday … 6=Saturday)
 * Used to calculate the calendar grid offset
 */
export const getFirstDayOfWeek = (year, month) =>
  new Date(year, month, 1).getDay();

/**
 * Returns true if the given day falls on Saturday or Sunday
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {number} day    1-indexed
 */
export const isWeekend = (year, month, day) => {
  const dow = new Date(year, month, day).getDay();
  return dow === 0 || dow === 6;
};

/**
 * Returns a Set of all weekend day-numbers for a given month
 * @returns {Set<number>}
 */
export const getWeekendSet = (year, month) => {
  const days = getDaysInMonth(year, month);
  const s = new Set();
  for (let d = 1; d <= days; d++) {
    if (isWeekend(year, month, d)) s.add(d);
  }
  return s;
};

// ─────────────────────────────────────────────────────────────────────────────
//  THAI PUBLIC HOLIDAYS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns list of Thai public holidays for a given month
 * @param {number} year
 * @param {number} month  0-indexed
 * @returns {{ date: number, name: string }[]}
 */
export const getThaiHolidays = (year, month) =>
  (THAI_HOLIDAYS[year]?.[month] || []).map((h) => ({ date: h.d, name: h.n }));

/**
 * Returns a Map of day → holiday name for quick lookup
 * @returns {Map<number, string>}
 */
export const getThaiHolidayMap = (year, month) =>
  new Map(getThaiHolidays(year, month).map((h) => [h.date, h.name]));

/**
 * Returns true if the given day is a Thai public holiday
 */
export const isThaiHoliday = (year, month, day) =>
  getThaiHolidays(year, month).some((h) => h.date === day);

// ─────────────────────────────────────────────────────────────────────────────
//  FIRESTORE KEY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates the Firestore document key for a given month
 * Format: "YYYY-MM"  e.g. "2025-03"
 * Used as document ID in sp_cfg and sp_sched collections
 *
 * @param {number} year
 * @param {number} month  0-indexed
 * @returns {string}
 */
export const monthKey = (year, month) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULE SERIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts schedule/stats objects for Firestore storage
 * Firestore requires string keys — converts numeric day keys → string
 *
 * @param {import('./types').SolverResult} result
 * @returns {{ scheduleDoc: Object, statsDoc: Object }}
 */
export const serializeForFirestore = ({ schedule, stats, violations, bestC }) => {
  const scheduleDoc = {};
  Object.entries(schedule).forEach(([k, v]) => (scheduleDoc[k] = v));

  const statsDoc = {};
  Object.entries(stats).forEach(([k, v]) => (statsDoc[k] = v));

  return { scheduleDoc, statsDoc, violations, bestC };
};

/**
 * Converts Firestore schedule/stats back to numeric-keyed objects
 *
 * @param {Object} firestoreData
 * @returns {{ schedule, stats, violations, bestC }}
 */
export const deserializeFromFirestore = (firestoreData) => {
  const schedule = {};
  Object.entries(firestoreData.schedule || {}).forEach(([k, v]) => (schedule[+k] = v));

  const stats = {};
  Object.entries(firestoreData.stats || {}).forEach(([k, v]) => (stats[+k] = v));

  return {
    schedule,
    stats,
    violations: firestoreData.violations || [],
    bestC:      firestoreData.bestC ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a month + year into Thai display string
 * e.g. (2025, 2) → "มีนาคม 2025"
 *
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {string[]} monthNames  — import MONTHS from constants
 */
export const formatMonthYear = (year, month, monthNames) =>
  `${monthNames[month]} ${year}`;

/**
 * Returns today's date parts (year, month 0-indexed, day 1-indexed)
 */
export const getToday = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

/**
 * Returns true if the given (year, month, day) is today
 */
export const isToday = (year, month, day) => {
  const t = getToday();
  return t.year === year && t.month === month && t.day === day;
};
