import { Member, MonthConfig, SolverResult, Slot, MemberStats, Violation, SubsetTag } from "./types";
import { W, SA, SA_ROUNDS, LNS_ITERATIONS } from "./constants";
import { getDaysInMonth, getWeekendSet, isThaiHoliday } from "./dateUtils";
import { deltaSoftScore, isHardFeasible } from "../scheduling/constraintKernel";

interface FairnessBalanceRuleInput {
    id: string;
    name: string;
    enabled: boolean;
    severity: 'hard' | 'soft';
    scopeType: 'intra_tag' | 'cohort';
    targetTagId?: string;
    memberTagIds?: string[];
    slotScope: Array<'1A' | '1B' | '2' | '3'>;
    metric: 'count';
    dayClass: 'all' | 'holiday' | 'noon';
    hardCapGap?: number;
    softWeight?: number;
}

interface MemberTarget {
    targetHoliday?: number;
    targetWeekday?: number;
}

interface SolveOptions {
    seed?: number;
    extraAssignedByDay?: Record<number, Set<string>>;
    fairnessRules?: FairnessBalanceRuleInput[];
    objectiveWeights?: {
        fairness?: number;
        clustering?: number;
        cumulativeDeficit?: number;
    };
    memberTargets?: Record<string, MemberTarget>;
}

interface CohortGapViolation {
    ruleId: string;
    ruleName: string;
    dayClass: 'holiday' | 'noon';
    gap: number;
    cap: number;
    memberCount: number;
}

function createSeededRng(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 4-Phase Hybrid Solver:
 * 1. Priority Greedy (Warm-start)
 * 2. CP Backtracking (Omitted/Pass-through)
 * 3. SA with Restarts (Optimize constraints)
 * 4. LNS (Window-based local search)
 */
export function solve(
    members: Member[],
    config: MonthConfig,
    year: number,
    month: number,
    mode: 'all' | '2nd3rd' = 'all',
    options: SolveOptions = {}
): SolverResult {
    const { constraints = [], confDays = [], noonDays = [], r1picks = {}, existingShifts = {}, subsets = [], cumulativeWeights = {} } = config;

    const daysInMonth = getDaysInMonth(year, month);
    const wkSet = getWeekendSet(year, month);
    const active = members.filter((m) => m.active);
    const ids = active.map((m) => m.id);
    const byId = (id: string) => active.find((m) => m.id === id);
    const rng = createSeededRng(options.seed ?? (Date.now() >>> 0));
    const objectiveWeights = {
        fairness: Math.max(0, options.objectiveWeights?.fairness ?? 1),
        clustering: Math.max(0, options.objectiveWeights?.clustering ?? 1),
        cumulativeDeficit: Math.max(0, options.objectiveWeights?.cumulativeDeficit ?? 1),
    };

    // Helpers to work with tags
    const hasTag = (m: Member, tagId: string) => (m.tags && m.tags.includes(tagId)) || m.role === tagId || m.subset === tagId;
    const getMembersWithTag = (tagId: string) => active.filter(m => hasTag(m, tagId)).map(m => m.id);

    const confSet = new Set(confDays.map((c) => c.date));
    const noonSet = new Set(noonDays.map((c) => c.date));
    const isNoon = (day: number): boolean => noonSet.has(day);
    const isHolidayBase = (day: number): boolean => wkSet.has(day) || isThaiHoliday(year, month, day);
    // Holiday class is exclusive from noon to avoid double counting.
    const isHolidayExclusive = (day: number): boolean => isHolidayBase(day) && !isNoon(day);

    // Pre-compute holiday set once to avoid repeated isThaiHoliday() calls in the hot SA/LNS loop
    const holidaySet = new Set<number>();
    for (let d = 1; d <= daysInMonth; d++) {
        if (isHolidayExclusive(d)) holidaySet.add(d);
    }

    // Build subset eligibility sets from SubsetTag definitions (the source of truth)
    const subset1stIds = new Set(subsets.filter(s => s.eligible1st).map(s => s.id));
    const subset2ndIds = new Set(subsets.filter(s => s.eligible2nd).map(s => s.id));
    const subset3rdIds = new Set(subsets.filter(s => s.eligible3rd).map(s => s.id));

    // Build call pools: check explicit call tags first, then fall through to SubsetTag eligibility.
    // This ensures r2sry/r3sry/r3sir personnel are always included in pool3rd even if the user
    // never manually assigned the 'third_call' tag.
    const pool1st = active.filter(m =>
        hasTag(m, 'first_call') || [...subset1stIds].some(sid => hasTag(m, sid))
    ).map(m => m.id);

    const pool2nd = active.filter(m =>
        hasTag(m, 'second_call') || [...subset2ndIds].some(sid => hasTag(m, sid))
    ).map(m => m.id);

    const pool3rd = active.filter(m =>
        hasTag(m, 'third_call') || [...subset3rdIds].some(sid => hasTag(m, sid))
    ).map(m => m.id);

    const offByDay: Record<number, Set<string>> = {};
    for (let d = 1; d <= daysInMonth; d++) offByDay[d] = new Set();
    constraints.filter((c) => c.type === "off").forEach((c) => {
        if (c.date >= 1 && c.date <= daysInMonth) offByDay[c.date].add(c.memberId);
    });

    // Support for R1 picks (manual allocation)
    const r1Claim: Record<number, string> = {};
    Object.keys(r1picks).forEach(memberId => {
        (r1picks[memberId] || []).forEach((d) => {
            if (d >= 1 && d <= daysInMonth && !r1Claim[d]) r1Claim[d] = memberId;
        });
    });

    const shuffle = <T>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const extraAssignedByDay: Record<number, Set<string>> = {};
    for (let d = 1; d <= daysInMonth; d++) {
        extraAssignedByDay[d] = new Set(options.extraAssignedByDay?.[d] || []);
    }

    const dayAssignedInCore = (slot: Slot): Set<string> => {
        const s = new Set<string>();
        if (slot.f1) s.add(slot.f1);
        if (slot.f2) s.add(slot.f2);
        if (slot.sec) s.add(slot.sec);
        if (slot.thi) s.add(slot.thi);
        return s;
    };

    const canAssignToDay = (day: number, slot: Slot, candidateId: string): boolean => {
        if (!isHardFeasible({
            day,
            slot,
            candidateId,
            offByDay,
            extraAssignedByDay,
        })) return false;
        const assigned = dayAssignedInCore(slot);
        return !assigned.has(candidateId);
    };

    const slotValue = (slot: Slot, key: '1A' | '1B' | '2' | '3'): string | null => {
        if (key === '1A') return slot.f1 || null;
        if (key === '1B') return slot.f2 || null;
        if (key === '2') return slot.sec || null;
        return slot.thi || null;
    };

    const fairnessRules = (options.fairnessRules || []).filter((r) => r.enabled);
    const dayMatchesClass = (day: number, dayClass: 'all' | 'holiday' | 'noon'): boolean => {
        if (dayClass === 'all') return true;
        if (dayClass === 'noon') return isNoon(day);
        return isHolidayExclusive(day);
    };

    const evaluateFairnessScopes = (sol: Slot[]): {
        hard: number;
        soft: number;
        violations: Violation[];
        breakdown: Record<string, number>;
        cohortGapViolations: CohortGapViolation[];
    } => {
        let hard = 0;
        let soft = 0;
        const violations: Violation[] = [];
        const breakdown: Record<string, number> = {
            intraTagTotalHard: 0,
            intraTagHolidayHard: 0,
            intraTagNoonHard: 0,
            intraTagNoonSoft: 0,
            cohortBalanceHard: 0,
            cohortHolidayGapHard: 0,
            cohortNoonGapHard: 0,
        };
        const cohortGapViolations: CohortGapViolation[] = [];

        const addBreakdown = (key: string, value: number) => {
            breakdown[key] = (breakdown[key] || 0) + value;
        };

        for (const rule of fairnessRules) {
            const memberIds = rule.scopeType === 'intra_tag'
                ? getMembersWithTag(String(rule.targetTagId || ''))
                : Array.from(new Set((rule.memberTagIds || []).flatMap((tagId) => getMembersWithTag(tagId))));
            if (memberIds.length <= 1) continue;
            const counts: Record<string, number> = {};
            memberIds.forEach((id) => { counts[id] = 0; });

            for (let d = 1; d <= daysInMonth; d++) {
                if (!dayMatchesClass(d, rule.dayClass)) continue;
                const slot = sol[d - 1];
                for (const lv of rule.slotScope) {
                    const assigned = slotValue(slot, lv);
                    if (assigned && counts[assigned] != null) counts[assigned] += 1;
                }
            }

            const vals = Object.values(counts);
            const max = Math.max(...vals);
            const min = Math.min(...vals);
            const gap = max - min;
            const isCohortGapRule = rule.scopeType === 'cohort' && (rule.dayClass === 'holiday' || rule.dayClass === 'noon');
            // Enforce strict overall cohort gap <= 1 for holiday/noon.
            const cap = isCohortGapRule ? 1 : Math.max(0, Number(rule.hardCapGap ?? 1));
            const exceed = Math.max(0, gap - cap);
            if (exceed <= 0) continue;

            const severity: 'hard' | 'soft' = isCohortGapRule ? 'hard' : rule.severity;
            if (severity === 'hard') {
                hard += exceed;
            } else {
                const weight = Math.max(1, Number(rule.softWeight ?? 60));
                soft += exceed * weight;
            }

            violations.push({
                sev: severity,
                day: null,
                msg: `${rule.name} imbalance: max=${max}, min=${min}, gap=${gap}, cap=${cap}`,
            });

            if (rule.scopeType === 'intra_tag' && rule.dayClass === 'all' && rule.severity === 'hard') addBreakdown('intraTagTotalHard', exceed);
            if (rule.scopeType === 'intra_tag' && rule.dayClass === 'holiday' && rule.severity === 'hard') addBreakdown('intraTagHolidayHard', exceed);
            if (rule.scopeType === 'intra_tag' && rule.dayClass === 'noon' && rule.severity === 'hard') addBreakdown('intraTagNoonHard', exceed);
            if (rule.scopeType === 'intra_tag' && rule.dayClass === 'noon' && rule.severity === 'soft') addBreakdown('intraTagNoonSoft', exceed * Math.max(1, Number(rule.softWeight ?? 60)));
            if (rule.scopeType === 'cohort' && rule.severity === 'hard') addBreakdown('cohortBalanceHard', exceed);
            if (isCohortGapRule) {
                if (rule.dayClass === 'holiday') addBreakdown('cohortHolidayGapHard', exceed);
                if (rule.dayClass === 'noon') addBreakdown('cohortNoonGapHard', exceed);
                cohortGapViolations.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    dayClass: rule.dayClass as 'holiday' | 'noon',
                    gap,
                    cap,
                    memberCount: memberIds.length,
                });
            }
        }
        return { hard, soft, violations, breakdown, cohortGapViolations };
    };

    // -------------------------------------------------------------------------
    //  PHASE 1: PRIORITY GREEDY (Fill 2nd/3rd call first for constraints)
    // -------------------------------------------------------------------------
    function buildGreedy(): Slot[] {
        const sol: Slot[] = Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const ex = (existingShifts[d] || { f1: "", f2: "", sec: "", thi: null }) as Slot;
            return {
                f1: ex.f1 || "",
                f2: ex.f2 || "",
                sec: ex.sec || "",
                thi: ex.thi || null
            };
        });

        const cnt: Record<string, Record<string, number>> = { f: {}, s: {}, t: {} };
        ids.forEach(id => {
            cnt.f[id] = 0; cnt.s[id] = 0; cnt.t[id] = 0;
            for (let d = 1; d <= daysInMonth; d++) {
                const ex = sol[d - 1];
                if (ex.f1 === id || ex.f2 === id) cnt.f[id]++;
                if (ex.sec === id) cnt.s[id]++;
                if (ex.thi === id) cnt.t[id]++;
            }
        });

        // Per-day-class trackers so the greedy distributes noon/holiday shifts fairly
        const cnt_noon: Record<string, number> = {};
        const cnt_holiday: Record<string, number> = {};
        ids.forEach(id => { cnt_noon[id] = 0; cnt_holiday[id] = 0; });
        for (let d = 1; d <= daysInMonth; d++) {
            const ex = sol[d - 1];
            const allEx = [ex.f1, ex.f2, ex.sec, ex.thi].filter(id => id && id !== "");
            if (isNoon(d))    allEx.forEach(id => { if (cnt_noon[id]    != null) cnt_noon[id]++; });
            if (holidaySet.has(d)) allEx.forEach(id => { if (cnt_holiday[id] != null) cnt_holiday[id]++; });
        }

        // Exact shifts targets (e.g. R3SIR_TOTAL = 5)
        const exactTargetSets = subsets.filter(s => s.exactShifts != null);
        const isAtCap = (id: string, sets: typeof exactTargetSets) => {
            const m = byId(id);
            if (!m) return false;
            for (const sub of sets) {
                if (hasTag(m, sub.id) && (cnt.s[id] + cnt.t[id]) >= sub.exactShifts!) return true;
            }
            return false;
        };

        // Step 1: Fill 2nd Call
        // Primary sort key: day-class count (noon count on noon days, holiday count on holiday days)
        // Secondary sort key: total 2nd call count + cumulative historical weight
        // This ensures noon/holiday shifts are distributed evenly from the start.
        for (let d = 1; d <= daysInMonth; d++) {
            if (sol[d - 1].sec) continue;
            const isNoonDay    = isNoon(d);
            const isHolidayDay = !isNoonDay && holidaySet.has(d);
            let cand = pool2nd.filter(id => !isAtCap(id, exactTargetSets) && canAssignToDay(d, sol[d - 1], id));
            cand.sort((a, b) => {
                const aCls = isNoonDay ? cnt_noon[a] : isHolidayDay ? cnt_holiday[a] : 0;
                const bCls = isNoonDay ? cnt_noon[b] : isHolidayDay ? cnt_holiday[b] : 0;
                if (aCls !== bCls) return aCls - bCls;
                return (cnt.s[a] + (cumulativeWeights[a] || 0) * objectiveWeights.cumulativeDeficit)
                     - (cnt.s[b] + (cumulativeWeights[b] || 0) * objectiveWeights.cumulativeDeficit);
            });
            sol[d - 1].sec = cand[0] || "";
            if (sol[d - 1].sec) {
                cnt.s[sol[d - 1].sec]++;
                if (isNoonDay)    cnt_noon[sol[d - 1].sec]++;
                if (isHolidayDay) cnt_holiday[sol[d - 1].sec]++;
            }
        }

        // Step 2: Fill 3rd Call — only when 2nd call is R1 สระบุรี (they need senior backup)
        for (let d = 1; d <= daysInMonth; d++) {
            const sec = sol[d - 1].sec;
            if (sol[d - 1].thi || !sec) continue;

            const secMem = byId(sec);
            // R1 สระบุรี performing 2nd call requires a 3rd call senior backup.
            // Check via tag so PersonnelManager assignments drive the logic, not a hardcoded flag.
            const needsSupport = !!(secMem && hasTag(secMem, 'r1sry'));

            if (needsSupport && pool3rd.length > 0) {
                let cand = pool3rd.filter(id => id !== sec && canAssignToDay(d, sol[d - 1], id));
                cand.sort((a, b) => (
                    cnt.t[a] + (cumulativeWeights[a] || 0) * objectiveWeights.cumulativeDeficit
                ) - (
                    cnt.t[b] + (cumulativeWeights[b] || 0) * objectiveWeights.cumulativeDeficit
                ));
                if (cand.length > 0) {
                    sol[d - 1].thi = cand[0];
                    cnt.t[sol[d - 1].thi!]++;
                }
            }
        }

        // Step 2.5: Fairness repair pass — fix noon/holiday intra-group imbalance
        // Runs once after greedy, before SA. Directly swaps over→under within each
        // fairness rule group so the SA starts from a balanced initial state.
        for (const rule of fairnessRules) {
            if (rule.dayClass === 'all') continue;
            const memberIds = rule.scopeType === 'intra_tag'
                ? getMembersWithTag(String(rule.targetTagId || ''))
                : Array.from(new Set((rule.memberTagIds || []).flatMap(t => getMembersWithTag(t))));
            if (memberIds.length <= 1) continue;

            const cap = Math.max(0, Number(rule.hardCapGap ?? 1));

            // Build current counts for this rule
            const rCounts: Record<string, number> = {};
            memberIds.forEach(id => { rCounts[id] = 0; });
            for (let d = 1; d <= daysInMonth; d++) {
                if (rule.dayClass === 'noon'    && !isNoon(d))    continue;
                if (rule.dayClass === 'holiday' && !holidaySet.has(d)) continue;
                const slot = sol[d - 1];
                for (const lv of rule.slotScope) {
                    const assigned = lv === '1A' ? slot.f1 : lv === '1B' ? slot.f2 : lv === '2' ? slot.sec : slot.thi;
                    if (assigned && rCounts[assigned] != null) rCounts[assigned]++;
                }
            }

            // Iteratively swap most-over → most-under until balanced
            for (let pass = 0; pass < 20; pass++) {
                const entries = Object.entries(rCounts);
                const maxEntry = entries.reduce((a, b) => b[1] > a[1] ? b : a);
                const minEntry = entries.reduce((a, b) => b[1] < a[1] ? b : a);
                if (maxEntry[1] - minEntry[1] <= cap) break;

                const overId  = maxEntry[0];
                const underId = minEntry[0];

                let swapped = false;
                for (let d = 1; d <= daysInMonth; d++) {
                    if (existingShifts[d]) continue;
                    if (rule.dayClass === 'noon'    && !isNoon(d))    continue;
                    if (rule.dayClass === 'holiday' && !holidaySet.has(d)) continue;
                    if (offByDay[d]?.has(underId)) continue;
                    const slot = sol[d - 1];
                    if (slot.f1 === underId || slot.f2 === underId || slot.sec === underId || slot.thi === underId) continue;
                    for (const lv of rule.slotScope) {
                        const cur = lv === '1A' ? slot.f1 : lv === '1B' ? slot.f2 : lv === '2' ? slot.sec : slot.thi;
                        if (cur !== overId) continue;
                        if (lv === '1A')      sol[d - 1].f1  = underId;
                        else if (lv === '1B') sol[d - 1].f2  = underId;
                        else if (lv === '2')  sol[d - 1].sec = underId;
                        else                  sol[d - 1].thi = underId as string | null;
                        rCounts[overId]--;
                        rCounts[underId]++;
                        swapped = true;
                        break;
                    }
                    if (swapped) break;
                }
                if (!swapped) break;
            }
        }

        if (mode === '2nd3rd') return sol;

        // Step 3: Fill 1st Calls
        const maxTargetSets = subsets.filter(s => s.maxShifts != null);
        const isMaxCapped = (id: string) => {
            const m = byId(id);
            if (!m) return false;
            for (const sub of maxTargetSets) {
                if (hasTag(m, sub.id)) {
                    // Check logic based on exact slot? Currently summing F+S+T or just F for some groups.
                    // For generalization, if maxShifts is defined, we limit total shifts or F shifts. Let's assume F shifts limit.
                    if (cnt.f[id] >= sub.maxShifts!) return true;
                }
            }
            return false;
        };

        for (let d = 1; d <= daysInMonth; d++) {
            const claim = r1Claim[d];
            const sec = sol[d - 1].sec;
            const thi = sol[d - 1].thi;

            if (!sol[d - 1].f1) {
                let cand = pool1st.filter(id => id !== sec && id !== thi && !isMaxCapped(id) && canAssignToDay(d, sol[d - 1], id));

                if (claim && cand.includes(claim)) {
                    sol[d - 1].f1 = claim;
                } else {
                    cand.sort((a, b) => cnt.f[a] - cnt.f[b]);
                    sol[d - 1].f1 = cand[0] || "";
                }
                if (sol[d - 1].f1) cnt.f[sol[d - 1].f1]++;
            }

            if (!sol[d - 1].f2) {
                let cand2 = pool1st.filter(id => id !== sol[d - 1].f1 && id !== sec && id !== thi && !isMaxCapped(id) && canAssignToDay(d, sol[d - 1], id));
                cand2.sort((a, b) => cnt.f[a] - cnt.f[b]);
                sol[d - 1].f2 = cand2[0] || "";
                if (sol[d - 1].f2) cnt.f[sol[d - 1].f2]++;
            }
        }

        return sol;
    }

    // Stochastic constructor used as primary warm start (replaces greedy-first entry path).
    function buildStochasticStart(): Slot[] {
        const sol: Slot[] = Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const ex = (existingShifts[d] || { f1: "", f2: "", sec: "", thi: null }) as Slot;
            return {
                f1: ex.f1 || "",
                f2: ex.f2 || "",
                sec: ex.sec || "",
                thi: ex.thi || null
            };
        });

        const dayOrder = shuffle(Array.from({ length: daysInMonth }, (_, i) => i + 1));
        const pickRandom = <T>(arr: T[]): T | null => arr.length ? arr[Math.floor(rng() * arr.length)] : null;

        for (const d of dayOrder) {
            const slot = sol[d - 1];
            if (!slot.sec) {
                const secCand = shuffle(pool2nd.filter(id => canAssignToDay(d, slot, id)));
                const pickedSec = pickRandom(secCand.slice(0, Math.min(4, secCand.length)));
                if (pickedSec) slot.sec = pickedSec;
            }

            if (!slot.thi && slot.sec) {
                const secMem = byId(slot.sec);
                if (secMem && hasTag(secMem, "r1sry")) {
                    const thiCand = shuffle(pool3rd.filter(id => id !== slot.sec && canAssignToDay(d, slot, id)));
                    const pickedThi = pickRandom(thiCand.slice(0, Math.min(4, thiCand.length)));
                    if (pickedThi) slot.thi = pickedThi;
                }
            }

            if (mode === 'all') {
                if (!slot.f1) {
                    const f1Cand = shuffle(pool1st.filter(id => canAssignToDay(d, slot, id)));
                    const pickedF1 = pickRandom(f1Cand.slice(0, Math.min(5, f1Cand.length)));
                    if (pickedF1) slot.f1 = pickedF1;
                }
                if (!slot.f2) {
                    const f2Cand = shuffle(pool1st.filter(id => id !== slot.f1 && canAssignToDay(d, slot, id)));
                    const pickedF2 = pickRandom(f2Cand.slice(0, Math.min(5, f2Cand.length)));
                    if (pickedF2) slot.f2 = pickedF2;
                }
            }
        }

        return sol;
    }

    // -------------------------------------------------------------------------
    //  PHASE 3: SIMULATED ANNEALING WITH RESTARTS
    // -------------------------------------------------------------------------
    function runSA(startSol: Slot[]): { best: Slot[], cost: number } {
        let cur = startSol.map(s => ({ ...s }));
        let curC = computeCost(cur);
        let b = cur.map(s => ({ ...s }));
        let bC = curC;

        let T = SA.T0;
        const alpha = Math.pow(SA.TMIN / SA.T0, 1 / SA.ITERATIONS);

        for (let i = 0; i < SA.ITERATIONS; i++) {
            const di = Math.floor(rng() * daysInMonth);
            const d = di + 1;
            const prev = { ...cur[di] };
            let swapIdx: number | null = null;
            let swapPrev: Slot | null = null;
            const ex = (existingShifts[d] || { f1: "", f2: "", sec: "", thi: null }) as Slot;

            const type = rng();
            if (type < 0.4 && mode === 'all') { // 1st call mutation
                if (!ex.f1 && rng() < 0.5 && pool1st.length > 0) {
                    const cand = pool1st.filter((id) => canAssignToDay(d, cur[di], id));
                    if (cand.length > 0) cur[di].f1 = cand[Math.floor(rng() * cand.length)];
                } else if (!ex.f2 && pool1st.length > 0) {
                    const cand = pool1st.filter((id) => canAssignToDay(d, cur[di], id));
                    if (cand.length > 0) cur[di].f2 = cand[Math.floor(rng() * cand.length)];
                }
            } else if (type < 0.8 && !ex.sec && pool2nd.length > 0) { // 2nd/3rd mutation
                const candSec = pool2nd.filter((id) => canAssignToDay(d, cur[di], id));
                if (candSec.length > 0) cur[di].sec = candSec[Math.floor(rng() * candSec.length)];
                if (!ex.thi) {
                    const secMem = byId(cur[di].sec);
                    // Legacy logic for 3rd call (R1 สระบุรี requires 3rd call)
                    if (secMem && hasTag(secMem, "r1sry") && pool3rd.length > 0) {
                        const p3 = shuffle(pool3rd.filter(id => id !== cur[di].sec && canAssignToDay(d, cur[di], id)));
                        cur[di].thi = p3[0] || null;
                    } else {
                        cur[di].thi = null;
                    }
                }
            } else { // Swap mutation
                const dj = Math.floor(rng() * daysInMonth);
                const d2 = dj + 1;
                if (!existingShifts[d] && !existingShifts[d2]) {
                    swapIdx = dj;
                    swapPrev = { ...cur[dj] };
                    const temp = { ...cur[di] };
                    cur[di] = { ...cur[dj] };
                    cur[dj] = temp;
                }
            }

            const newC = computeCost(cur);
            const delta = deltaSoftScore(curC, newC);

            if (delta < 0 || rng() < Math.exp(-delta / T)) {
                curC = newC;
                if (curC < bC) { bC = curC; b = cur.map(s => ({ ...s })); }
            } else {
                cur[di] = prev;
                if (swapIdx != null && swapPrev) cur[swapIdx] = swapPrev;
            }
            T *= alpha;
        }
        return { best: b, cost: bC };
    }

    // -------------------------------------------------------------------------
    //  PHASE 4: LARGE NEIGHBORHOOD SEARCH (LNS)
    // -------------------------------------------------------------------------
    function runLNS(startSol: Slot[]): Slot[] {
        let currentBest = startSol.map(s => ({ ...s }));
        let currentCost = computeCost(currentBest);

        for (let i = 0; i < LNS_ITERATIONS; i++) {
            const winSize = 3 + Math.floor(rng() * 4);
            const start = Math.floor(rng() * (daysInMonth - winSize));
            const backup = currentBest.slice(start, start + winSize).map(s => ({ ...s }));

            for (let d = start; d < start + winSize; d++) {
                const day = d + 1;
                const ex = (existingShifts[day] || { f1: "", f2: "", sec: "", thi: null }) as Slot;
                const type = rng();
                if (type < 0.5 && mode === 'all' && !ex.f1 && pool1st.length > 0) {
                    const cand = pool1st.filter((id) => canAssignToDay(day, currentBest[d], id));
                    if (cand.length > 0) currentBest[d].f1 = cand[Math.floor(rng() * cand.length)];
                } else if (!ex.sec && pool2nd.length > 0) {
                    const cand = pool2nd.filter((id) => canAssignToDay(day, currentBest[d], id));
                    if (cand.length > 0) currentBest[d].sec = cand[Math.floor(rng() * cand.length)];
                }
            }

            const newCost = computeCost(currentBest);
            if (newCost < currentCost) {
                currentCost = newCost;
            } else {
                for (let d = 0; d < winSize; d++) currentBest[start + d] = backup[d];
            }
        }
        return currentBest;
    }

    const memberTargets = options.memberTargets || {};
    const TARGET_PENALTY_WEIGHT = 40;

    function computeCost(sol: Slot[]): number {
        let hard = 0;
        let soft = 0;

        const cntF: Record<string, number> = {};
        const cntS: Record<string, number> = {};
        const cntT: Record<string, number> = {};
        const cntNoon: Record<string, number> = {};
        const cntConf: Record<string, number> = {};
        const cntHoliday: Record<string, number> = {};
        const cntWeekday: Record<string, number> = {};
        ids.forEach(id => { cntF[id] = 0; cntS[id] = 0; cntT[id] = 0; cntNoon[id] = 0; cntConf[id] = 0; cntHoliday[id] = 0; cntWeekday[id] = 0; });

        for (let d = 1; d <= daysInMonth; d++) {
            const { f1, f2, sec, thi } = sol[d - 1];
            const all = [f1, f2, sec, ...(thi ? [thi] : [])].filter(id => id !== "");

            all.forEach(id => { if (offByDay[d].has(id)) hard++; });
            const unique = new Set(all);
            if (unique.size < all.length) hard++;

            if (mode === 'all') {
                // Dynamic mutual exclusion
                const f1m = byId(f1), f2m = byId(f2), secm = byId(sec);
                subsets.filter(s => s.mutuallyExclusiveWith).forEach(sub => {
                    const tag1 = sub.id;
                    const tag2 = sub.mutuallyExclusiveWith!;
                    // If tag1 is in 2nd call, and tag2 is in 1st call
                    if (secm && hasTag(secm, tag1) && ((f1m && hasTag(f1m, tag2)) || (f2m && hasTag(f2m, tag2)))) hard++;
                    if (secm && hasTag(secm, tag2) && ((f1m && hasTag(f1m, tag1)) || (f2m && hasTag(f2m, tag1)))) hard++;
                });

                // Dynamic Pull constraints (prefer certain pairing)
                subsets.filter(s => s.pullTag).forEach(sub => {
                    const baseTag = sub.id;
                    const pullTag = sub.pullTag!;
                    if (secm && hasTag(secm, baseTag)) {
                        if (!(f1m && hasTag(f1m, pullTag)) && !(f2m && hasTag(f2m, pullTag))) {
                            soft += W.R3SIR_PULL * objectiveWeights.fairness;
                        }
                    }
                });
            }

            if (d < daysInMonth) {
                const nx = sol[d];
                const nxAll = [nx.f1, nx.f2, nx.sec, nx.thi].filter(id => id && id !== "");
                all.forEach(id => {
                    if (nxAll.includes(id)) hard++;
                });
            }

            if (d > 2) {
                const pv = sol[d - 3];
                const pvAll = [pv.f1, pv.f2, pv.sec, pv.thi].filter(id => id && id !== "");
                all.forEach(id => {
                    if (pvAll.includes(id)) soft += W.ALT_DAY * objectiveWeights.clustering;
                });
            }

            if (d >= 7) {
                all.forEach(id => {
                    let windowCount = 0;
                    for (let wd = d - 7; wd < d; wd++) {
                        const daySlots = [sol[wd].f1, sol[wd].f2, sol[wd].sec, sol[wd].thi];
                        if (daySlots.includes(id)) windowCount++;
                    }
                    if (windowCount > 3) soft += W.CLUSTERING * objectiveWeights.clustering * (windowCount - 3);
                });
            }

            if (f1) cntF[f1]++; if (f2) cntF[f2]++; if (sec) cntS[sec]++; if (thi) cntT[thi]++;
            if (isNoon(d)) all.forEach(id => cntNoon[id]++);
            if (confSet.has(d)) all.forEach(id => cntConf[id]++);
            if (holidaySet.has(d)) {
                all.forEach(id => { if (cntHoliday[id] != null) cntHoliday[id]++; });
            } else {
                all.forEach(id => { if (cntWeekday[id] != null) cntWeekday[id]++; });
            }
        }

        // Apply Dynamic Target Limitations (Max & Exact)
        subsets.forEach(sub => {
            const membersInSub = getMembersWithTag(sub.id);
            membersInSub.forEach(id => {
                const mTotalF = cntF[id] || 0;
                const mTotalST = (cntS[id] || 0) + (cntT[id] || 0);

                if (sub.maxShifts != null) {
                    // Distinguish between purely 1st call limits vs total sum limits based on group.
                    // For now, heuristic: if eligible for 1st call primarily, limit 1st. Else, limit total.
                    const val = sub.eligible1st ? mTotalF : mTotalF + mTotalST;
                    if (val > sub.maxShifts) {
                        hard += (val - sub.maxShifts);
                        soft += W.R1SIR_CAP * objectiveWeights.fairness * (val - sub.maxShifts);
                    }
                }

                if (sub.exactShifts != null) {
                    const val = sub.eligible1st ? mTotalF : mTotalST;
                    if (val !== sub.exactShifts) {
                        hard += Math.abs(val - sub.exactShifts);
                    }
                }
            });

            // Apply Balance constraints dynamically
                if (sub.balanceGroup && membersInSub.length > 1) {
                    const vals = membersInSub.map(id => cntF[id] + cntS[id] + cntT[id]);
                    soft += W.BAL_R1SIR * objectiveWeights.fairness * (Math.max(...vals) - Math.min(...vals));
                }
            });

        // Hardcoded global pools balance logic converted to dynamic: 
        // Balancing 2nd call pool as a whole
        if (pool2nd.length > 0) {
            const vals = pool2nd.map(id => cntF[id] + cntS[id] + cntT[id]);
            soft += W.BAL_2ND_POOL * objectiveWeights.fairness * (Math.max(...vals) - Math.min(...vals));
        }

        const fairnessEval = evaluateFairnessScopes(sol);
        hard += fairnessEval.hard;
        soft += fairnessEval.soft;

        // Secondary objective: soft penalty for deviation from individual targets
        for (const id of ids) {
            const t = memberTargets[id];
            if (!t) continue;
            if (t.targetHoliday != null && Number.isFinite(t.targetHoliday)) {
                soft += Math.abs((cntHoliday[id] || 0) - t.targetHoliday) * TARGET_PENALTY_WEIGHT;
            }
            if (t.targetWeekday != null && Number.isFinite(t.targetWeekday)) {
                soft += Math.abs((cntWeekday[id] || 0) - t.targetWeekday) * TARGET_PENALTY_WEIGHT;
            }
        }

        return soft + (hard * 1000000);
    }

    function computeScoreBreakdown(sol: Slot[]): Record<string, number> {
        const cntF: Record<string, number> = {};
        const cntS: Record<string, number> = {};
        const cntT: Record<string, number> = {};
        ids.forEach(id => { cntF[id] = 0; cntS[id] = 0; cntT[id] = 0; });

        let fairness = 0;
        let clustering = 0;
        let cumulativeDeficit = 0;
        let preference = 0;
        let hard = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const { f1, f2, sec, thi } = sol[d - 1];
            const all = [f1, f2, sec, ...(thi ? [thi] : [])].filter(id => id !== "");
            if (f1) cntF[f1]++; if (f2) cntF[f2]++; if (sec) cntS[sec]++; if (thi) cntT[thi]++;
            all.forEach(id => { if (offByDay[d].has(id)) hard += 1; });
            if (new Set(all).size < all.length) hard += 1;
            if (d < daysInMonth) {
                const nx = sol[d];
                const nxAll = [nx.f1, nx.f2, nx.sec, nx.thi].filter(id => id && id !== "");
                all.forEach(id => { if (nxAll.includes(id)) hard += 1; });
            }
            if (d > 2) {
                const pv = sol[d - 3];
                const pvAll = [pv.f1, pv.f2, pv.sec, pv.thi].filter(id => id && id !== "");
                all.forEach(id => { if (pvAll.includes(id)) clustering += W.ALT_DAY * objectiveWeights.clustering; });
            }
            if (d >= 7) {
                all.forEach(id => {
                    let windowCount = 0;
                    for (let wd = d - 7; wd < d; wd++) {
                        const daySlots = [sol[wd].f1, sol[wd].f2, sol[wd].sec, sol[wd].thi];
                        if (daySlots.includes(id)) windowCount++;
                    }
                    if (windowCount > 3) clustering += W.CLUSTERING * objectiveWeights.clustering * (windowCount - 3);
                });
            }

            const f1m = byId(f1), f2m = byId(f2), secm = byId(sec);
            subsets.filter(s => s.pullTag).forEach(sub => {
                const baseTag = sub.id;
                const pullTag = sub.pullTag!;
                if (secm && hasTag(secm, baseTag)) {
                    if (!(f1m && hasTag(f1m, pullTag)) && !(f2m && hasTag(f2m, pullTag))) {
                        preference += W.R3SIR_PULL * objectiveWeights.fairness;
                    }
                }
            });
        }

        if (pool2nd.length > 0) {
            const vals = pool2nd.map(id => cntF[id] + cntS[id] + cntT[id]);
            fairness += W.BAL_2ND_POOL * objectiveWeights.fairness * (Math.max(...vals) - Math.min(...vals));
        }
        subsets.forEach(sub => {
            const membersInSub = getMembersWithTag(sub.id);
            if (sub.balanceGroup && membersInSub.length > 1) {
                const vals = membersInSub.map(id => cntF[id] + cntS[id] + cntT[id]);
                fairness += W.BAL_R1SIR * objectiveWeights.fairness * (Math.max(...vals) - Math.min(...vals));
            }
        });
        for (const id of ids) {
            cumulativeDeficit += (cumulativeWeights[id] || 0) * (cntS[id] + cntT[id]) * objectiveWeights.cumulativeDeficit;
        }

        const fairnessEval = evaluateFairnessScopes(sol);
        hard += fairnessEval.hard;
        fairness += fairnessEval.soft;
        return {
            hardPenalty: hard * 1000000,
            fairness,
            clustering,
            cumulativeDeficit,
            preference,
            ...fairnessEval.breakdown,
            total: hard * 1000000 + fairness + clustering + cumulativeDeficit + preference,
        };
    }

    let bestSol = buildStochasticStart();
    let bestCost = Number.POSITIVE_INFINITY;
    const START_ROUNDS = 3;

    for (let startRound = 0; startRound < START_ROUNDS; startRound++) {
        let current = buildStochasticStart();
        let currentCost = computeCost(current);
        for (let r = 0; r < SA_ROUNDS; r++) {
            const { best, cost } = runSA(current);
            if (cost < currentCost) {
                current = best;
                currentCost = cost;
            }
        }
        current = runLNS(current);
        currentCost = computeCost(current);
        if (currentCost < bestCost) {
            bestCost = currentCost;
            bestSol = current;
        }
    }

    const schedule: Record<number, Slot> = {};
    const stats: Record<string, MemberStats> = {};
    ids.forEach(id => stats[id] = { f: 0, s: 0, t: 0, total: 0, wk: 0, noon: 0, conf: 0, wScore: 0 });

    bestSol.forEach((s, i) => {
        const d = i + 1; schedule[d] = s;
        const wkVal = wkSet.has(d) ? 2 : 1;
        const update = (id: string, type: 'f' | 's' | 't') => {
            if (!stats[id]) return; stats[id][type]++; stats[id].total++;
            if (wkSet.has(d)) stats[id].wk++; if (isNoon(d)) stats[id].noon++;
            if (confSet.has(d)) stats[id].conf++; stats[id].wScore += wkVal;
        };
        if (s.f1) update(s.f1, 'f'); if (s.f2) update(s.f2, 'f'); if (s.sec) update(s.sec, 's'); if (s.thi) update(s.thi, 't');
    });

    const baseViolations = analyzeViolations(bestSol, daysInMonth, offByDay, members, config.subsets);
    const fairnessEval = evaluateFairnessScopes(bestSol);
    const violations = [...baseViolations, ...fairnessEval.violations];
    const scoreBreakdown = computeScoreBreakdown(bestSol);
    const infeasibilityReasons = Array.from(new Set(
        violations.filter(v => v.sev === 'hard').map(v => v.msg)
    )).slice(0, 20);
    return {
        schedule,
        stats,
        violations,
        bestC: bestCost,
        telemetry: {
            scoreBreakdown,
            infeasibilityReasons,
            cohortGapViolations: fairnessEval.cohortGapViolations,
        },
    };
}

export function analyzeViolations(best: Slot[], daysInMonth: number, offByDay: Record<number, Set<string>>, members: Member[], subsets: SubsetTag[]): Violation[] {
    const vio: Violation[] = [];
    const name = (id: string) => members.find(m => m.id === id)?.name || id;
    const byId = (id: string) => members.find((m) => m.id === id);
    const hasTag = (m: Member, tagId: string) => (m.tags && m.tags.includes(tagId)) || m.role === tagId || m.subset === tagId;

    const cntF: Record<string, number> = {}; const cntS: Record<string, number> = {}; const cntT: Record<string, number> = {};
    members.forEach(m => { cntF[m.id] = 0; cntS[m.id] = 0; cntT[m.id] = 0; });

    best.forEach((s, i) => {
        const d = i + 1;
        const all = [s.f1, s.f2, s.sec, ...(s.thi ? [s.thi] : [])].filter(id => id !== "");
        all.forEach(id => { if (offByDay[d].has(id)) vio.push({ sev: 'hard', day: d, msg: `${name(id)} มี OFF แต่ถูกจัดเวร` }); });
        if (s.f1 === s.f2 && s.f1 !== "") vio.push({ sev: 'hard', day: d, msg: `DUP: ${name(s.f1)} ซ้ำ 1st call` });
        if (s.sec !== "" && (s.f1 === s.sec || s.f2 === s.sec)) vio.push({ sev: 'hard', day: d, msg: `DUP: ${name(s.sec)} ซ้ำ 1st+2nd` });

        // Mutual exclusion dynamic lookup
        const f1m = byId(s.f1 || ""), f2m = byId(s.f2 || ""), secm = byId(s.sec || "");
        subsets.filter(s => s.mutuallyExclusiveWith).forEach(sub => {
            const tag1 = sub.id; const tag2 = sub.mutuallyExclusiveWith!;
            if (secm && hasTag(secm, tag1) && ((f1m && hasTag(f1m, tag2)) || (f2m && hasTag(f2m, tag2))))
                vio.push({ sev: 'hard', day: d, msg: `ขัดแย้ง: ${sub.name} 1st + 2nd วันเดียวกัน` });
            if (secm && hasTag(secm, tag2) && ((f1m && hasTag(f1m, tag1)) || (f2m && hasTag(f2m, tag1))))
                vio.push({ sev: 'hard', day: d, msg: `ขัดแย้ง: ${sub.name} 1st + 2nd วันเดียวกัน` });
        });

        if (i < daysInMonth - 1) {
            const nx = best[i + 1];
            const nxAll = [nx.f1, nx.f2, nx.sec, nx.thi].filter(id => id && id !== "");
            all.forEach(id => {
                if (nxAll.includes(id)) vio.push({ sev: 'hard', day: [d, d + 1], msg: `${name(id)} มีเวรติดกัน (วันนี้ ${d} และพรุ่งนี้ ${d + 1})` });
            });
        }

        if (s.f1) cntF[s.f1]++; if (s.f2) cntF[s.f2]++;
        if (s.sec) cntS[s.sec]++; if (s.thi) cntT[s.thi]++;
    });

    subsets.forEach(sub => {
        members.filter(m => hasTag(m, sub.id)).forEach(m => {
            const mTotalF = cntF[m.id];
            const mTotalST = cntS[m.id] + cntT[m.id];
            if (sub.maxShifts != null) {
                const val = sub.eligible1st ? mTotalF : mTotalF + mTotalST;
                if (val > sub.maxShifts) vio.push({ sev: 'hard', day: null, msg: `${name(m.id)} (${sub.name}) เวรเกินกำหนด: ได้ ${val} ขีดสุดคือ ${sub.maxShifts}` });
            }
            if (sub.exactShifts != null) {
                const val = sub.eligible1st ? mTotalF : mTotalST;
                if (val !== sub.exactShifts) vio.push({ sev: 'hard', day: null, msg: `${name(m.id)} (${sub.name}) จำนวนเวรไม่ถูกต้อง: ได้ ${val} เป้าคือ ${sub.exactShifts}` });
            }
        });
    });

    return vio;
}
