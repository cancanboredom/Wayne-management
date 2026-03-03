/**
 * ═══════════════════════════════════════════════════════════════
 *  SHIFTPLAN — TYPE DEFINITIONS  (JSDoc)
 *  Import these with  @typedef {import('./types').Member} Member
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * @typedef {'intern'|'r1sry'|'r1sir'|'r2sry'|'r3sry'|'r3sir'} RoleKey
 */

/**
 * @typedef {Object} Member
 * @property {number}  id      — unique auto-increment id
 * @property {string}  name    — display name
 * @property {RoleKey} role
 * @property {boolean} active  — true = included in this month's schedule
 */

/**
 * @typedef {Object} OffConstraint
 * @property {number} memberId
 * @property {number} date      — 1-indexed day of month
 * @property {'off'}  type
 */

/**
 * @typedef {Object} TaggedDay
 * @property {number} date   — 1-indexed day of month
 * @property {string} [label]
 */

/**
 * Monthly config stored in Firestore under sp_cfg/{YYYY-MM}
 * @typedef {Object} MonthConfig
 * @property {OffConstraint[]} constraints  — OFF days per member
 * @property {TaggedDay[]}     confDays     — conference report days
 * @property {TaggedDay[]}     noonDays     — noon report days
 * @property {Object.<number, number[]>} r1picks  — memberId → day[]  (R1สระ self-picks)
 */

/**
 * One day's shift assignment
 * @typedef {Object} Slot
 * @property {number}       f1   — 1st call slot A (memberId)
 * @property {number}       f2   — 1st call slot B (memberId)
 * @property {number}       sec  — 2nd call (memberId)
 * @property {number|null}  thi  — 3rd call (memberId | null) — only when sec = r1sry
 */

/**
 * Per-member shift statistics for a given month
 * @typedef {Object} MemberStats
 * @property {number} f      — total 1st call shifts
 * @property {number} s      — total 2nd call shifts
 * @property {number} t      — total 3rd call shifts
 * @property {number} total  — f + s + t
 * @property {number} wk     — shifts on weekend/holiday
 * @property {number} noon   — shifts on noon report days
 * @property {number} conf   — shifts on conference days
 * @property {number} wScore — weighted score (weekend = 2pts, weekday = 1pt)
 */

/**
 * @typedef {Object} Violation
 * @property {'hard'|'soft'} sev  — severity
 * @property {number|null}   day  — 1-indexed day (null for month-level issues)
 * @property {string}        msg  — human-readable Thai message
 */

/**
 * Solver output
 * @typedef {Object} SolverResult
 * @property {Object.<number, Slot>}    schedule    — day → Slot
 * @property {Object.<number, MemberStats>} stats   — memberId → stats
 * @property {Violation[]}             violations
 * @property {number}                  bestC        — final SA cost (lower = better)
 */

/**
 * Firestore document shape for sp_sched/{YYYY-MM}
 * @typedef {Object} ScheduleDoc
 * @property {Object.<string, Slot>}       schedule    — keys are strings in Firestore
 * @property {Object.<string, MemberStats>} stats
 * @property {Violation[]}                 violations
 * @property {number}                      bestC
 * @property {import('firebase/firestore').Timestamp} generatedAt
 */

/**
 * Firestore document shape for sp/members
 * @typedef {Object} MembersDoc
 * @property {Member[]} list
 * @property {number}   nextId
 */

export {};
