/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIFTPLAN — SIMULATED ANNEALING SOLVER  v3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  INPUT
 *  ─────
 *  members   : Member[]        — all members (active + inactive)
 *  config    : MonthConfig     — constraints, confDays, noonDays, r1picks
 *  year      : number
 *  month     : number (0-indexed)
 *
 *  OUTPUT
 *  ──────
 *  { schedule, stats, violations, bestC }
 *
 *  schedule  : { [day: number]: Slot }
 *               Slot = { f1, f2, sec, thi? }  (memberId | null)
 *  stats     : { [memberId]: MemberStats }
 *  violations: Violation[]
 *  bestC     : number  (SA final cost, lower = better)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SLOT DEFINITIONS
 * ───────────────────────────────────────────────────────────────────────────
 *  f1  = 1st call slot A  (intern or r1sir)
 *  f2  = 1st call slot B  (intern or r1sir) — dual 1st call system
 *  sec = 2nd call         (r1sry, r2sry, r3sry, r3sir)
 *  thi = 3rd call         (r2sry, r3sry, r3sir) — only when sec = r1sry
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONSTRAINT HIERARCHY
 * ───────────────────────────────────────────────────────────────────────────
 *  🔴 ABSOLUTE (penalty = 999,999)
 *     H1  OFF          — member has OFF constraint on that day
 *     H2  CONSEC       — same person on same slot on consecutive days
 *     H3  DUP          — same person appears in multiple slots same day
 *     H4  R1SIR_R1SRY  — R1ศิริ in 1st + R1สระ in 2nd on same day
 *     H5  R3SIR_TOTAL  — R3ศิริ 2nd+3rd ≠ 5 per month (per deviation)
 *
 *  🟠 THE MUST (high penalty, per excess unit)
 *     M1  R1SIR_CAP    — R1ศิริ 1st call > 6 per month  (8,000 × excess)
 *     M2  BAL_2ND_POOL — unbalanced 2nd call in {r2sry,r3sry,r3sir}  (500 × spread)
 *     M3  BAL_23_POOL  — unbalanced 2nd+3rd in same pool             (200 × spread)
 *
 *  🟢 SOFT (prefer but not enforced)
 *     S1  ALT_DAY      — same person on day d and d+2 same slot  (15 × count)
 *     S2  BAL_INTERN   — unbalanced 1st call among interns        (60 × spread)
 *     S3  BAL_R1SIR    — unbalanced 1st call among r1sir          (65 × spread)
 *     S4  BAL_R1SRY    — unbalanced 1st call among r1sry          (50 × spread)
 *     S5  NOON_BAL     — unbalanced noon report shifts             (60 × spread)
 *     S6  CONF_BAL     — unbalanced conference shifts              (50 × spread)
 *     S7  R3SIR_PULL   — prefer R3ศิริ 2nd paired with R1ศิริ 1st  (30 × miss)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ELI_1ST, ELI_2ND, ELI_3RD, W, R1SIR_MAX, R3SIR_TOTAL, SA } from "./constants";
import { getDaysInMonth, isWeekend, getWeekendSet } from "./dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function solve(members, config, year, month) {
  const { constraints = [], confDays = [], noonDays = [], r1picks = {} } = config;

  // ── Derived lookups ──────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(year, month);
  const wkSet       = getWeekendSet(year, month);
  const byId        = (id) => active.find((m) => m.id === id);

  const active    = members.filter((m) => m.active);
  const ids       = active.map((m) => m.id);

  // Role arrays
  const internArr  = active.filter((m) => m.role === "intern").map((m) => m.id);
  const r1sirArr   = active.filter((m) => m.role === "r1sir").map((m) => m.id);
  const r1sryArr   = active.filter((m) => m.role === "r1sry").map((m) => m.id);
  const r2sryArr   = active.filter((m) => m.role === "r2sry").map((m) => m.id);
  const r3sryArr   = active.filter((m) => m.role === "r3sry").map((m) => m.id);
  const r3sirArr   = active.filter((m) => m.role === "r3sir").map((m) => m.id);

  const r1sirSet   = new Set(r1sirArr);
  const r1srySet   = new Set(r1sryArr);
  const r3sirSet   = new Set(r3sirArr);

  // Eligibility pools
  const pool1st    = active.filter((m) => ELI_1ST.has(m.role)).map((m) => m.id);
  const pool2nd    = active.filter((m) => ELI_2ND.has(m.role)).map((m) => m.id);
  const pool3rd    = active.filter((m) => ELI_3RD.has(m.role)).map((m) => m.id);

  // Pool for balance constraints (M2, M3)
  const balPool23  = [...r2sryArr, ...r3sryArr, ...r3sirArr];

  // ── Validation ───────────────────────────────────────────────────────────
  if (!pool2nd.length)
    throw new Error("ต้องมี R1-3 สระบุรี หรือ R3 ศิริราช สำหรับ 2nd call");
  if (!pool1st.length && !r1sryArr.length)
    throw new Error("ต้องมี Intern หรือ R1 ศิริราช สำหรับ 1st call");

  // ── Pre-compute day sets ─────────────────────────────────────────────────
  const offByDay = {};
  for (let d = 1; d <= daysInMonth; d++) offByDay[d] = new Set();
  constraints
    .filter((c) => c.type === "off")
    .forEach((c) => {
      if (c.date >= 1 && c.date <= daysInMonth) offByDay[c.date].add(c.memberId);
    });

  const confSet = new Set(confDays.map((c) => c.date));
  const noonSet = new Set(noonDays.map((c) => c.date));

  // R1สระ self-claimed days → first-come, no duplicate days
  const r1Claim = {};
  active
    .filter((m) => m.role === "r1sry")
    .forEach((m) => {
      (r1picks[m.id] || []).forEach((d) => {
        if (d >= 1 && d <= daysInMonth && !r1Claim[d]) r1Claim[d] = m.id;
      });
    });

  // ─────────────────────────────────────────────────────────────────────────
  //  GREEDY INITIAL SOLUTION
  //  Builds a feasible schedule day-by-day respecting:
  //    - OFF constraints
  //    - No consecutive days (last-day tracking)
  //    - R3ศิริ total cap (priority sort)
  //    - R1ศิริ 1st call cap
  //    - R1สระ self-picks
  // ─────────────────────────────────────────────────────────────────────────
  function buildGreedy() {
    const sol  = [];
    const cnt  = { f: {}, s: {}, t: {} };  // cumulative counts
    const last = { f: {}, s: {}, t: {} };  // last assigned day
    ids.forEach((id) => {
      cnt.f[id] = 0; cnt.s[id] = 0; cnt.t[id] = 0;
      last.f[id] = -99; last.s[id] = -99; last.t[id] = -99;
    });

    for (let d = 1; d <= daysInMonth; d++) {
      // Helper: has R3ศิริ hit their monthly cap?
      const r3sirAtCap = (id) =>
        r3sirSet.has(id) && (cnt.s[id] + cnt.t[id]) >= R3SIR_TOTAL;

      // ── 2nd call ──────────────────────────────────────────────────────
      // Sort: R3ศิริ who need more shifts first (to hit cap=5), then by count
      let cand2 = pool2nd
        .filter((id) => !offByDay[d].has(id) && last.s[id] !== d - 1 && !r3sirAtCap(id))
        .sort((a, b) => {
          const remA = r3sirSet.has(a) ? (R3SIR_TOTAL - cnt.s[a] - cnt.t[a]) : 99;
          const remB = r3sirSet.has(b) ? (R3SIR_TOTAL - cnt.s[b] - cnt.t[b]) : 99;
          return remB !== remA ? remB - remA : cnt.s[a] - cnt.s[b];
        });
      if (!cand2.length) cand2 = pool2nd.filter((id) => !offByDay[d].has(id) && !r3sirAtCap(id));
      if (!cand2.length) cand2 = pool2nd.filter((id) => !offByDay[d].has(id));
      if (!cand2.length) cand2 = [...pool2nd]; // last resort
      const sec = cand2[0];

      // ── 3rd call (only when 2nd = r1sry) ──────────────────────────────
      let thi = null;
      if (byId(sec)?.role === "r1sry") {
        let cand3 = pool3rd
          .filter((id) => id !== sec && !offByDay[d].has(id) && !r3sirAtCap(id))
          .sort((a, b) => cnt.t[a] - cnt.t[b]);
        if (!cand3.length) cand3 = pool3rd.filter((id) => id !== sec && !offByDay[d].has(id));
        if (!cand3.length) cand3 = pool3rd.filter((id) => id !== sec);
        if (cand3.length) thi = cand3[0];
      }

      // ── 1st call (f1, f2) ─────────────────────────────────────────────
      const claimId = r1Claim[d];
      const r1sirNotCapped = (id) => !(r1sirSet.has(id) && cnt.f[id] >= R1SIR_MAX);

      const p1      = pool1st.filter((id) => id !== sec && id !== thi && !offByDay[d].has(id) && last.f[id] !== d - 1 && r1sirNotCapped(id));
      const p1_noCo = pool1st.filter((id) => id !== sec && id !== thi && !offByDay[d].has(id) && r1sirNotCapped(id));
      const p1_any  = pool1st.filter((id) => id !== sec && id !== thi);

      let f1, f2;
      if (claimId) {
        // R1สระ has claimed this day — lock f1
        f1 = claimId;
        const rest = (
          p1.filter((id) => id !== f1).length      ? p1.filter((id) => id !== f1) :
          p1_noCo.filter((id) => id !== f1).length ? p1_noCo.filter((id) => id !== f1) :
          p1_any.filter((id) => id !== f1)
        );
        f2 = rest.length ? rest.sort((a, b) => cnt.f[a] - cnt.f[b])[0] : f1;
      } else {
        const pool = (p1.length ? p1 : p1_noCo.length ? p1_noCo : p1_any)
          .sort((a, b) => cnt.f[a] - cnt.f[b]);
        f1 = pool[0] || pool1st[0] || ids[0];
        const rest2 = (
          p1.filter((id) => id !== f1).length ? p1.filter((id) => id !== f1) :
          p1_any.filter((id) => id !== f1)
        );
        f2 = rest2.length ? rest2.sort((a, b) => cnt.f[a] - cnt.f[b])[0] : f1;
      }

      sol.push({ f1, f2, sec, thi });

      // Update counts & last-day
      cnt.f[f1]++; cnt.f[f2]++; last.f[f1] = d; last.f[f2] = d;
      cnt.s[sec]++; last.s[sec] = d;
      if (thi) { cnt.t[thi]++; last.t[thi] = d; }
    }
    return sol;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  COST FUNCTION
  //  Evaluates a complete solution and returns total penalty score
  //  Lower score = better solution
  // ─────────────────────────────────────────────────────────────────────────
  function computeCost(sol) {
    let cost = 0;

    // Per-member accumulators for balance constraints
    const cnt1stIntern = {}; internArr.forEach((id) => (cnt1stIntern[id] = 0));
    const cnt1stR1sir  = {}; r1sirArr.forEach((id) => (cnt1stR1sir[id] = 0));
    const cnt1stR1sry  = {}; r1sryArr.forEach((id) => (cnt1stR1sry[id] = 0));
    const cnt2nd = {}; ids.forEach((id) => (cnt2nd[id] = 0));
    const cnt3rd = {}; ids.forEach((id) => (cnt3rd[id] = 0));
    const cntNoon = {}; ids.forEach((id) => (cntNoon[id] = 0));
    const cntConf = {}; ids.forEach((id) => (cntConf[id] = 0));

    for (let d = 1; d <= daysInMonth; d++) {
      const { f1, f2, sec, thi } = sol[d - 1];
      const allSlots = [f1, f2, sec, ...(thi ? [thi] : [])];

      // ── H1: OFF constraint ─────────────────────────────────────────────
      allSlots.forEach((id) => { if (offByDay[d].has(id)) cost += W.OFF; });

      // ── H3: DUP — same person multiple slots same day ─────────────────
      if (f1 === f2)                      cost += W.DUP;
      if (f1 === sec || f2 === sec)       cost += W.DUP;
      if (thi && (f1 === thi || f2 === thi || sec === thi)) cost += W.DUP;

      // ── H4: R1SIR_R1SRY — R1ศิริ 1st + R1สระ 2nd ─────────────────────
      if (r1srySet.has(sec) && (r1sirSet.has(f1) || r1sirSet.has(f2)))
        cost += W.R1SIR_R1SRY;

      // ── S7: R3SIR_PULL — prefer R3ศิริ 2nd with R1ศิริ 1st ───────────
      if (r3sirSet.has(sec) && !r1sirSet.has(f1) && !r1sirSet.has(f2))
        cost += W.R3SIR_PULL;

      // ── H2: CONSEC — consecutive days same slot ────────────────────────
      if (d < daysInMonth) {
        const nx = sol[d]; // sol[d] = day d+1
        if (nx.f1 === f1 || nx.f1 === f2 || nx.f2 === f1 || nx.f2 === f2) cost += W.CONSEC;
        if (nx.sec === sec) cost += W.CONSEC;
        if (thi && nx.thi === thi) cost += W.CONSEC;
      }

      // ── S1: ALT_DAY — same slot on day d and d+2 ─────────────────────
      if (d > 2) {
        const pv = sol[d - 3]; // sol[d-3] = day d-2
        if (pv.f1 === f1 || pv.f1 === f2 || pv.f2 === f1 || pv.f2 === f2) cost += W.ALT_DAY;
        if (pv.sec === sec) cost += W.ALT_DAY;
      }

      // Accumulate counts for end-of-loop balance constraints
      [f1, f2].forEach((id) => {
        if (cnt1stIntern[id] !== undefined) cnt1stIntern[id]++;
        if (cnt1stR1sir[id] !== undefined)  cnt1stR1sir[id]++;
        if (cnt1stR1sry[id] !== undefined)  cnt1stR1sry[id]++;
      });
      cnt2nd[sec]++;
      if (thi) cnt3rd[thi]++;
      if (noonSet.has(d)) allSlots.forEach((id) => { if (cntNoon[id] !== undefined) cntNoon[id]++; });
      if (confSet.has(d)) allSlots.forEach((id) => { if (cntConf[id] !== undefined) cntConf[id]++; });
    }

    // ── M1: R1SIR_CAP — R1ศิริ 1st > 6 per month ─────────────────────────
    r1sirArr.forEach((id) => {
      const excess = cnt1stR1sir[id] - R1SIR_MAX;
      if (excess > 0) cost += W.R1SIR_CAP * excess;
    });

    // ── H5: R3SIR_TOTAL — R3ศิริ 2nd+3rd must = 5 ────────────────────────
    r3sirArr.forEach((id) => {
      const diff = Math.abs(cnt2nd[id] + cnt3rd[id] - R3SIR_TOTAL);
      if (diff > 0) cost += W.R3SIR_TOTAL * diff;
    });

    // ── M2: BAL_2ND_POOL — balance 2nd call in {r2sry, r3sry, r3sir} ─────
    if (balPool23.length > 1) {
      const vals2 = balPool23.map((id) => cnt2nd[id]);
      cost += W.BAL_2ND_POOL * (Math.max(...vals2) - Math.min(...vals2));
    }

    // ── M3: BAL_23_POOL — balance 2nd+3rd combined in same pool ──────────
    if (balPool23.length > 1) {
      const vals23 = balPool23.map((id) => cnt2nd[id] + cnt3rd[id]);
      cost += W.BAL_23_POOL * (Math.max(...vals23) - Math.min(...vals23));
    }

    // ── S2-S4: balance 1st call per group ────────────────────────────────
    const balanceGroup = (arr, accum, weight) => {
      if (arr.length < 2) return;
      const vals = arr.map((id) => accum[id]);
      cost += weight * (Math.max(...vals) - Math.min(...vals));
    };
    balanceGroup(internArr, cnt1stIntern, W.BAL_INTERN);
    balanceGroup(r1sirArr,  cnt1stR1sir,  W.BAL_R1SIR);
    balanceGroup(r1sryArr,  cnt1stR1sry,  W.BAL_R1SRY);

    // ── S5-S6: balance noon/conf ──────────────────────────────────────────
    if (noonSet.size && ids.length > 1) {
      const ns = ids.map((id) => cntNoon[id]);
      cost += W.NOON_BAL * (Math.max(...ns) - Math.min(...ns));
    }
    if (confSet.size && ids.length > 1) {
      const cs = ids.map((id) => cntConf[id]);
      cost += W.CONF_BAL * (Math.max(...cs) - Math.min(...cs));
    }

    return cost;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SIMULATED ANNEALING LOOP
  //  Two mutation types:
  //    A (50%) — swap 2nd call slot (and regenerate 3rd if needed)
  //    B (50%) — swap f1 or f2 slot (respecting R1สระ self-picks)
  // ─────────────────────────────────────────────────────────────────────────
  const alpha = Math.pow(SA.TMIN / SA.T0, 1 / SA.ITERATIONS);
  let cur   = buildGreedy();
  let best  = cur.map((x) => ({ ...x }));
  let curC  = computeCost(cur);
  let bestC = curC;
  let T     = SA.T0;

  // Helper: count R3ศิริ's current total (2nd+3rd) in solution
  const r3sirCurrentTotal = (sol, id) => {
    if (!r3sirSet.has(id)) return 0;
    let t = 0;
    for (let k = 0; k < daysInMonth; k++) {
      if (sol[k].sec === id) t++;
      if (sol[k].thi === id) t++;
    }
    return t;
  };

  for (let i = 0; i < SA.ITERATIONS; i++) {
    const di  = Math.floor(Math.random() * daysInMonth);
    const old = { ...cur[di] };
    const dn  = di + 1; // 1-indexed day

    if (Math.random() < 0.5) {
      // ── Mutation A: change 2nd call ──────────────────────────────────
      const atCap = (id) => r3sirSet.has(id) && r3sirCurrentTotal(cur, id) >= R3SIR_TOTAL;
      const avail = pool2nd.filter((id) => id !== old.sec && !offByDay[dn].has(id) && !atCap(id));
      const src   = avail.length ? avail : pool2nd.filter((id) => id !== old.sec && !offByDay[dn].has(id));
      if (!src.length) { T *= alpha; continue; }

      const newSec = src[Math.floor(Math.random() * src.length)];
      let newThi = null;
      if (byId(newSec)?.role === "r1sry") {
        const atCap3 = (id) => r3sirSet.has(id) && r3sirCurrentTotal(cur, id) >= R3SIR_TOTAL;
        const p3ok = pool3rd.filter((id) => id !== newSec && !offByDay[dn].has(id) && !atCap3(id));
        const p3fb = pool3rd.filter((id) => id !== newSec);
        const p3   = p3ok.length ? p3ok : p3fb;
        if (p3.length) newThi = p3[Math.floor(Math.random() * p3.length)];
      }
      cur[di] = { ...old, sec: newSec, thi: newThi };

    } else {
      // ── Mutation B: change f1 or f2 ──────────────────────────────────
      const isF1Claimed = r1Claim[dn] === old.f1;
      const isF2Claimed = r1Claim[dn] === old.f2;
      let slot = Math.random() < 0.5 ? "f1" : "f2";
      if (slot === "f1" && isF1Claimed) slot = "f2";
      if (slot === "f2" && isF2Claimed) slot = "f1";
      if (slot === "f1" && isF1Claimed) { T *= alpha; continue; } // both claimed

      const other = slot === "f1" ? old.f2 : old.f1;
      const avail1 = pool1st.filter((id) => id !== other && id !== old.sec && id !== old.thi);
      if (!avail1.length) { T *= alpha; continue; }
      cur[di] = { ...old, [slot]: avail1[Math.floor(Math.random() * avail1.length)] };
    }

    // ── Accept / reject ───────────────────────────────────────────────
    const newC  = computeCost(cur);
    const delta = newC - curC;
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      curC = newC;
      if (curC < bestC) { bestC = curC; best = cur.map((x) => ({ ...x })); }
    } else {
      cur[di] = old; // reject
    }
    T *= alpha;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BUILD OUTPUT
  // ─────────────────────────────────────────────────────────────────────────
  const schedule = {};
  const stats    = {};
  ids.forEach((id) => (stats[id] = { f: 0, s: 0, t: 0, total: 0, wk: 0, noon: 0, conf: 0, wScore: 0 }));

  for (let d = 1; d <= daysInMonth; d++) {
    schedule[d] = best[d - 1];
    const { f1, f2, sec, thi } = best[d - 1];
    const weekWeight = wkSet.has(d) ? 2 : 1;

    const track = (id, slot) => {
      if (!stats[id]) return;
      stats[id][slot]++;
      stats[id].total++;
      if (wkSet.has(d))   stats[id].wk++;
      if (noonSet.has(d)) stats[id].noon++;
      if (confSet.has(d)) stats[id].conf++;
      stats[id].wScore += weekWeight;
    };
    track(f1, "f"); track(f2, "f");
    track(sec, "s");
    if (thi) track(thi, "t");
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  VIOLATION REPORT
  // ─────────────────────────────────────────────────────────────────────────
  const violations = analyzeViolations(best, daysInMonth, offByDay, active, r1Claim, r1srySet, r1sirSet, r3sirSet, r3sirArr, r1sirArr);

  return { schedule, stats, violations, bestC };
}

// ─────────────────────────────────────────────────────────────────────────────
//  VIOLATION ANALYZER
//  Scans the best solution for all hard/soft violations and returns
//  human-readable messages with severity tags
// ─────────────────────────────────────────────────────────────────────────────
function analyzeViolations(best, daysInMonth, offByDay, members, r1Claim, r1srySet, r1sirSet, r3sirSet, r3sirArr, r1sirArr) {
  const vio = [];
  const name = (id) => members.find((m) => m.id === id)?.name || `id:${id}`;

  // Cumulative trackers for end-of-month checks
  const r1sirMonthly = {};  r1sirArr.forEach((id) => (r1sirMonthly[id] = 0));
  const r3sirMonthly = {};  r3sirArr.forEach((id) => (r3sirMonthly[id] = 0));

  for (let d = 1; d <= daysInMonth; d++) {
    const { f1, f2, sec, thi } = best[d - 1];
    const all = [f1, f2, sec, ...(thi ? [thi] : [])];

    // H1 OFF
    all.forEach((id) => {
      if (offByDay[d].has(id))
        vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}: ${name(id)} มี OFF แต่ถูกจัดเวร` });
    });

    // H3 DUP
    if (f1 === f2)
      vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}: DUP — 1st call ทั้งสอง slot เป็น ${name(f1)}` });
    if (f1 === sec || f2 === sec)
      vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}: DUP — ${name(sec)} ซ้ำ 1st+2nd` });
    if (thi && (f1 === thi || f2 === thi || sec === thi))
      vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}: DUP — ${name(thi)} ซ้ำ` });

    // H4 R1SIR_R1SRY
    if (r1srySet.has(sec) && (r1sirSet.has(f1) || r1sirSet.has(f2)))
      vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}: R1ศิริ 1st + R1สระ 2nd วันเดียวกัน` });

    // H2 CONSEC
    if (d < daysInMonth) {
      const nx = best[d];
      [f1, f2].forEach((id) => {
        if (nx.f1 === id || nx.f2 === id)
          vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}–${d + 1}: ${name(id)} 1st call ติดกัน` });
      });
      if (nx.sec === sec)
        vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}–${d + 1}: ${name(sec)} 2nd call ติดกัน` });
      if (thi && nx.thi === thi)
        vio.push({ sev: "hard", day: d, msg: `วันที่ ${d}–${d + 1}: ${name(thi)} 3rd call ติดกัน` });
    }

    // S1 ALT_DAY (soft)
    if (d > 2) {
      const pv = best[d - 3];
      [f1, f2].forEach((id) => {
        if (id === pv.f1 || id === pv.f2)
          vio.push({ sev: "soft", day: d, msg: `วันที่ ${d - 2} & ${d}: ${name(id)} 1st call วันเว้นวัน` });
      });
      if (sec === pv.sec)
        vio.push({ sev: "soft", day: d, msg: `วันที่ ${d - 2} & ${d}: ${name(sec)} 2nd call วันเว้นวัน` });
    }

    // Accumulate monthly
    [f1, f2].forEach((id) => { if (r1sirMonthly[id] !== undefined) r1sirMonthly[id]++; });
    if (r3sirMonthly[sec] !== undefined) r3sirMonthly[sec]++;
    if (thi && r3sirMonthly[thi] !== undefined) r3sirMonthly[thi]++;
  }

  // M1 R1SIR_CAP
  r1sirArr.forEach((id) => {
    if (r1sirMonthly[id] > R1SIR_MAX)
      vio.push({ sev: "hard", day: null, msg: `${name(id)}: 1st call ${r1sirMonthly[id]} ครั้ง (เกิน cap ${R1SIR_MAX}) — THE MUST violated` });
  });

  // H5 R3SIR_TOTAL
  r3sirArr.forEach((id) => {
    if (r3sirMonthly[id] !== R3SIR_TOTAL)
      vio.push({ sev: "hard", day: null, msg: `${name(id)}: 2nd+3rd รวม ${r3sirMonthly[id]} ครั้ง (ต้องเป็น ${R3SIR_TOTAL}) — ABSOLUTE violated` });
  });

  return vio;
}
