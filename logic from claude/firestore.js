/**
 * ═══════════════════════════════════════════════════════════════
 *  SHIFTPLAN — FIRESTORE DATA LAYER
 * ═══════════════════════════════════════════════════════════════
 *
 *  All Firestore reads and writes go through this file.
 *  Components should never import from "firebase/firestore" directly.
 *
 *  COLLECTION STRUCTURE
 *  ─────────────────────────────────────────────────────────────
 *
 *  sp/members
 *    { list: Member[], nextId: number }
 *    — shared across all months, updated whenever team changes
 *
 *  sp_cfg/{YYYY-MM}
 *    { constraints, confDays, noonDays, r1picks }
 *    — per-month config; created on first save, auto-loads on month change
 *
 *  sp_sched/{YYYY-MM}
 *    { schedule, stats, violations, bestC, generatedAt }
 *    — solver output; overwritten each time "จัดเวร" is pressed
 *
 *  WHY SEPARATE COLLECTIONS?
 *    Firestore charges per document read. Splitting config from schedule
 *    means editing OFF days (sp_cfg) doesn't re-read the schedule (sp_sched).
 *    Members are global so team changes propagate to all month views instantly.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { monthKey, serializeForFirestore, deserializeFromFirestore } from "./dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
//  COLLECTION / DOC REFS
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERS_REF  = () => doc(db, "sp", "members");
const CFG_REF      = (year, month) => doc(db, "sp_cfg", monthKey(year, month));
const SCHED_REF    = (year, month) => doc(db, "sp_sched", monthKey(year, month));

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the members document (real-time)
 * Calls onData whenever members change — from any device
 *
 * @param {function({ list: Member[], nextId: number })} onData
 * @param {function(Error)} onError
 * @returns {function} unsubscribe
 */
export function subscribeMembers(onData, onError) {
  return onSnapshot(
    MEMBERS_REF(),
    (snap) => {
      if (snap.exists()) {
        onData({ list: snap.data().list || [], nextId: snap.data().nextId || 1 });
      } else {
        onData({ list: [], nextId: 1 });
      }
    },
    onError
  );
}

/**
 * Save the members list to Firestore
 * @param {Member[]} list
 * @param {number}   nextId
 */
export async function saveMembers(list, nextId) {
  await setDoc(MEMBERS_REF(), { list, nextId });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONTH CONFIG  (OFF, conf, noon, r1picks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the config document for a given month (real-time)
 *
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {function(MonthConfig)} onData
 * @param {function(Error)} onError
 * @returns {function} unsubscribe
 */
export function subscribeConfig(year, month, onData, onError) {
  return onSnapshot(
    CFG_REF(year, month),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        onData({
          constraints: d.constraints || [],
          confDays:    d.confDays    || [],
          noonDays:    d.noonDays    || [],
          r1picks:     d.r1picks     || {},
        });
      } else {
        // No config yet for this month — return empty defaults
        onData({ constraints: [], confDays: [], noonDays: [], r1picks: {} });
      }
    },
    onError
  );
}

/**
 * Save the month config to Firestore
 * Overwrites the entire document (all fields updated atomically)
 *
 * @param {number}      year
 * @param {number}      month  0-indexed
 * @param {MonthConfig} config
 */
export async function saveConfig(year, month, config) {
  await setDoc(CFG_REF(year, month), {
    constraints: config.constraints,
    confDays:    config.confDays,
    noonDays:    config.noonDays,
    r1picks:     config.r1picks,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULE  (solver output)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the schedule document for a given month (real-time)
 * When another user runs "จัดเวร", all browsers update automatically
 *
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {function({ schedule, stats, violations, bestC }|null)} onData
 *   — null when no schedule exists yet for this month
 * @param {function(Error)} onError
 * @returns {function} unsubscribe
 */
export function subscribeSchedule(year, month, onData, onError) {
  return onSnapshot(
    SCHED_REF(year, month),
    (snap) => {
      if (snap.exists()) {
        onData(deserializeFromFirestore(snap.data()));
      } else {
        onData(null);
      }
    },
    onError
  );
}

/**
 * Save solver output to Firestore
 * Numeric keys in schedule/stats are converted to strings for Firestore
 *
 * @param {number}       year
 * @param {number}       month  0-indexed
 * @param {SolverResult} result
 */
export async function saveSchedule(year, month, result) {
  const { scheduleDoc, statsDoc, violations, bestC } = serializeForFirestore(result);
  await setDoc(SCHED_REF(year, month), {
    schedule:     scheduleDoc,
    stats:        statsDoc,
    violations,
    bestC,
    generatedAt:  serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONVENIENCE: subscribe to all three at once
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to members + config + schedule for a given month simultaneously
 * Returns an unsubscribe function that cleans up all three listeners
 *
 * Typical usage in a React component:
 *
 *   useEffect(() => {
 *     const unsub = subscribeAll(year, month, {
 *       onMembers: ({ list, nextId }) => { ... },
 *       onConfig:  (config) => { ... },
 *       onSchedule:(result) => { ... },
 *       onError:   (err)    => console.error(err),
 *     });
 *     return unsub;
 *   }, [year, month]);
 *
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {{ onMembers, onConfig, onSchedule, onError }} callbacks
 * @returns {function} unsubscribe all
 */
export function subscribeAll(year, month, { onMembers, onConfig, onSchedule, onError }) {
  const unsubM  = subscribeMembers(onMembers, onError);
  const unsubC  = subscribeConfig(year, month, onConfig, onError);
  const unsubSc = subscribeSchedule(year, month, (data) => onSchedule(data), onError);
  return () => { unsubM(); unsubC(); unsubSc(); };
}
