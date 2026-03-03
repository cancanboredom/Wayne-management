import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import { analyzeViolations } from "./src/lib/shiftplan/solver";
import { DEFAULT_SUBSETS } from "./src/lib/shiftplan/constants";
import type { Constraint, Member, MonthConfig, OffConstraint, Slot } from "./src/lib/shiftplan/types";
import { getDaysInMonth } from "./src/lib/shiftplan/dateUtils";
import type { RuleSetV1 } from "./src/lib/scheduling/types";
import { runUniversalSolve } from "./src/lib/scheduling/universalSolver";
import {
  DEFAULT_WORKSPACE_ID,
  createWorkspace,
  ensureDefaultWorkspace,
  ensureWorkspaceSchedulingConfig,
  getWorkspaceSchedulingConfig,
  getRosterTemplates,
  getWorkspacePeopleMonthSnapshot,
  getWorkspacePeopleMonthSnapshotAll,
  getWorkspaceConstraints,
  getRuleSet,
  getWorkspacePeople,
  getWorkspaceShifts,
  initWorkspaceSchema,
  listWorkspaces,
  logSolverRun,
  migrateLegacyToDefaultWorkspace,
  resolveMonthRoster,
  getWorkspaceCumulative,
  saveRuleSet,
  saveWorkspaceCumulative,
  saveWorkspaceSchedulingConfig,
  saveRosterTemplates,
  saveWorkspaceConstraints,
  saveMonthRoster,
  saveWorkspacePeople,
  saveWorkspacePeopleMonthSnapshot,
  saveWorkspaceShifts,
} from "./src/lib/scheduling/workspaceService";
import { buildRuleSetFromWorkspaceConfig, toSubsetTagsFromWorkspaceConfig } from "./src/lib/scheduling/legacyAdapter";
import { validateRuleSetV1, validateWorkspaceSchedulingConfig } from "./src/lib/scheduling/validator";
import { countRuleGroupTags, normalizePersonTags } from "./src/features/shared/personTagModel";

dotenv.config();
const PREVIEW_READONLY = String(process.env.PREVIEW_READONLY || '').toLowerCase() === 'true';

// Initialize SQLite database
const db = new Database('wayne_duty.db');

// Setup tables
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    role TEXT,
    subset TEXT,
    unavailableDates TEXT,
    targetTotal INTEGER,
    targetHoliday INTEGER,
    targetWeekday INTEGER,
    "group" TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    date TEXT,
    personId TEXT,
    level TEXT,
    PRIMARY KEY (date, personId, level)
  );

  CREATE TABLE IF NOT EXISTS manual_highlights (
    date TEXT PRIMARY KEY
  );
  
  CREATE TABLE IF NOT EXISTS noon_days (
    date TEXT PRIMARY KEY
  );
  
  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    name TEXT,
    timestamp INTEGER,
    month TEXT,
    shifts TEXT
  );

  CREATE TABLE IF NOT EXISTS month_locked_versions (
    workspaceId TEXT NOT NULL,
    monthKey TEXT NOT NULL,
    versionId TEXT NOT NULL,
    shifts TEXT NOT NULL,
    people TEXT NOT NULL,
    lockedAt INTEGER NOT NULL,
    PRIMARY KEY (workspaceId, monthKey)
  );

  CREATE TABLE IF NOT EXISTS version_people_snapshots (
    workspaceId TEXT NOT NULL,
    versionId TEXT NOT NULL,
    people TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (workspaceId, versionId)
  );

  CREATE TABLE IF NOT EXISTS deleted_people_bin (
    workspaceId TEXT NOT NULL,
    personId TEXT NOT NULL,
    personJson TEXT NOT NULL,
    deletedShiftsJson TEXT NOT NULL,
    affectedMonthsJson TEXT NOT NULL,
    deletedAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (workspaceId, personId)
  );
  
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS constraints_store (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    targetTagId TEXT,
    condition TEXT,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS api_usage (
    date TEXT,
    endpoint TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (date, endpoint)
  );
`);

// Add tagIds column if it doesn't exist yet (safe to run every startup)
try { db.exec('ALTER TABLE people ADD COLUMN tagIds TEXT'); } catch (_) { }
try { db.exec('ALTER TABLE versions ADD COLUMN name TEXT'); } catch (_) { }
initWorkspaceSchema(db);
ensureDefaultWorkspace(db);
migrateLegacyToDefaultWorkspace(db);

// --- Free Tier Limits ---
const FREE_TIER_LIMITS: Record<string, { daily: number; label: string }> = {
  'smart-import': { daily: 250, label: 'Gemini API (Smart Import)' },
};

const SURY_TAGS = ['r1sry', 'r2sry', 'r3sry'];

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getUsageCount(endpoint: string): number {
  const today = getTodayStr();
  const row = db.prepare('SELECT count FROM api_usage WHERE date = ? AND endpoint = ?').get(today, endpoint) as any;
  return row?.count || 0;
}

function incrementUsage(endpoint: string): number {
  const today = getTodayStr();
  db.prepare(`
    INSERT INTO api_usage (date, endpoint, count) VALUES (?, ?, 1)
    ON CONFLICT(date, endpoint) DO UPDATE SET count = count + 1
  `).run(today, endpoint);
  return getUsageCount(endpoint);
}

function safeParseStringArray(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function normalizeSolveInput(body: any): {
  year: number;
  month: number;
  mode: "all" | "2nd3rd";
  seed?: number;
  cumulativeWeights: Record<string, number>;
  existingShifts: Record<number, Slot>;
  extraAssignmentsByDay: Record<number, Record<string, string>>;
} {
  const year = Number(body?.year);
  const month = Number(body?.month);
  const mode = body?.mode === "2nd3rd" ? "2nd3rd" : "all";
  const seed = Number.isInteger(body?.seed) ? Number(body.seed) : undefined;
  const cumulativeWeights =
    body?.cumulativeWeights && typeof body.cumulativeWeights === "object"
      ? Object.fromEntries(
        Object.entries(body.cumulativeWeights)
          .filter(([k, v]) => typeof k === "string" && Number.isFinite(Number(v)))
          .map(([k, v]) => [k, Number(v)])
      ) as Record<string, number>
      : {};
  const existingShifts: Record<number, Slot> = {};
  if (body?.existingShifts && typeof body.existingShifts === "object") {
    for (const [dayKey, rawSlot] of Object.entries(body.existingShifts)) {
      const day = Number(dayKey);
      if (!Number.isInteger(day) || day < 1) continue;
      const slot = (rawSlot && typeof rawSlot === "object") ? rawSlot as Partial<Slot> : {};
      existingShifts[day] = {
        f1: typeof slot.f1 === "string" ? slot.f1 : "",
        f2: typeof slot.f2 === "string" ? slot.f2 : "",
        sec: typeof slot.sec === "string" ? slot.sec : "",
        thi: typeof slot.thi === "string" ? slot.thi : null,
      };
    }
  }
  const extraAssignmentsByDay: Record<number, Record<string, string>> = {};
  const rows = Array.isArray(body?.existingShiftRows) ? body.existingShiftRows : [];
  for (const row of rows) {
    const date = typeof row?.date === "string" ? row.date : "";
    const level = typeof row?.level === "string" ? row.level : "";
    const personId = typeof row?.personId === "string" ? row.personId : "";
    const [y, m, d] = date.split("-").map(Number);
    if (y !== year || m !== month || !Number.isInteger(d) || d < 1) continue;
    if (!level) continue;
    if (!extraAssignmentsByDay[d]) extraAssignmentsByDay[d] = {};
    extraAssignmentsByDay[d][level] = personId;
  }
  return { year, month, mode, seed, cumulativeWeights, existingShifts, extraAssignmentsByDay };
}

function resolveWorkspaceId(req: any): string {
  const fromQuery = typeof req.query?.workspaceId === "string" ? req.query.workspaceId : "";
  const fromHeader = typeof req.headers?.["x-workspace-id"] === "string" ? req.headers["x-workspace-id"] : "";
  const fromBody = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : "";
  const workspaceId = fromQuery || fromHeader || fromBody || DEFAULT_WORKSPACE_ID;
  return workspaceId;
}

function parseWorkspacePeople(rows: any[]) {
  return rows.map((p: any) => ({
    ...p,
    unavailableDates: safeParseStringArray(p.unavailableDates),
    tagIds: safeParseStringArray(p.tagIds),
  }));
}

function normalizeIncomingTagIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function findMultiLevelSameDayConflicts(shifts: Array<{ date: string; personId: string; level: string }>): string[] {
  const byDatePerson = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!s?.date || !s?.personId || !s?.level) continue;
    if (s.personId === "__locked__") continue;
    const key = `${s.date}|${s.personId}`;
    if (!byDatePerson.has(key)) byDatePerson.set(key, new Set());
    byDatePerson.get(key)!.add(s.level);
  }
  const conflicts: string[] = [];
  for (const [key, levels] of byDatePerson.entries()) {
    if (levels.size <= 1) continue;
    const [date, personId] = key.split("|");
    conflicts.push(`${personId} has multiple levels on ${date}: ${Array.from(levels).join(", ")}`);
  }
  return conflicts;
}

function buildDeleteImpact(personId: string, shifts: Array<{ date: string; personId: string; level: string }>) {
  const impactedShifts = shifts.filter((s) => s.personId === personId);
  const affectedMonths = Array.from(new Set(impactedShifts.map((s) => s.date.slice(0, 7)))).sort();
  const affectedByLevel = {
    "1A": impactedShifts.filter((s) => s.level === "1A").length,
    "1B": impactedShifts.filter((s) => s.level === "1B").length,
    "2": impactedShifts.filter((s) => s.level === "2").length,
    "3": impactedShifts.filter((s) => s.level === "3").length,
  };
  const affectedDatesSample = impactedShifts
    .map((s) => s.date)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .sort()
    .slice(0, 8);
  return {
    impactedShifts,
    preview: {
      removedShiftCount: impactedShifts.length,
      affectedMonths,
      affectedByLevel,
      affectedDatesSample,
      warnings: impactedShifts.length > 0 ? ["ย้ายบุคลากรออกแล้ว เวรที่ผูกกับคนนี้จะถูกถอดออกจากตารางปัจจุบัน"] : [],
    },
  };
}

function toShiftsFromSchedule(year: number, month: number, schedule: Record<number, Slot>) {
  const shifts: Array<{ date: string; personId: string; level: '1A' | '1B' | '2' | '3' }> = [];
  for (const [dayRaw, slot] of Object.entries(schedule)) {
    const day = Number(dayRaw);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (slot.f1) shifts.push({ date, personId: slot.f1, level: "1A" });
    if (slot.f2) shifts.push({ date, personId: slot.f2, level: "1B" });
    if (slot.sec) shifts.push({ date, personId: slot.sec, level: "2" });
    if (slot.thi) shifts.push({ date, personId: slot.thi, level: "3" });
  }
  return shifts;
}

function syncLegacyPeople(people: any[]) {
  db.prepare("DELETE FROM people").run();
  const insert = db.prepare(`
    INSERT INTO people (id, name, color, role, subset, unavailableDates, targetTotal, targetHoliday, targetWeekday, "group", tagIds)
    VALUES (@id, @name, @color, @role, @subset, @unavailableDates, @targetTotal, @targetHoliday, @targetWeekday, @group, @tagIds)
  `);
  const tx = db.transaction((items: any[]) => {
    for (const item of items) {
      insert.run({
        id: item.id,
        name: item.name,
        color: item.color ?? null,
        role: item.role ?? null,
        subset: item.subset ?? null,
        unavailableDates: item.unavailableDates ? JSON.stringify(item.unavailableDates) : null,
        targetTotal: item.targetTotal ?? null,
        targetHoliday: item.targetHoliday ?? null,
        targetWeekday: item.targetWeekday ?? null,
        group: item.group ?? null,
        tagIds: item.tagIds ? JSON.stringify(item.tagIds) : null,
      });
    }
  });
  tx(people);
}

function syncLegacyShifts(shifts: any[]) {
  db.prepare("DELETE FROM shifts").run();
  const insert = db.prepare("INSERT INTO shifts (date, personId, level) VALUES (@date, @personId, @level)");
  const tx = db.transaction((items: any[]) => {
    for (const item of items) insert.run(item);
  });
  tx(shifts);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // Demo preview mode: allow reads, block all API writes.
  app.use('/api', (req, res, next) => {
    if (!PREVIEW_READONLY) return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return res.status(403).json({
      error: 'Preview is read-only',
      code: 'PREVIEW_READONLY',
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/preview-status", (_req, res) => {
    res.json({
      readonly: PREVIEW_READONLY,
      message: "Preview mode: ดูได้อย่างเดียว",
    });
  });

  // --- Free Tier Status Endpoints ---
  app.get("/api/gemini-status", (req, res) => {
    const hasKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
    res.json({ configured: hasKey });
  });

  app.get("/api/usage", (req, res) => {
    const usage: Record<string, any> = {};
    for (const [endpoint, limit] of Object.entries(FREE_TIER_LIMITS)) {
      const count = getUsageCount(endpoint);
      const pct = Math.round((count / limit.daily) * 100);
      let level: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (pct >= 100) level = 'exceeded';
      else if (pct >= 80) level = 'warning';
      usage[endpoint] = {
        label: limit.label,
        used: count,
        limit: limit.daily,
        percentage: pct,
        level,
      };
    }
    res.json({ date: getTodayStr(), usage });
  });

  app.get("/api/holidays", async (req, res) => {
    try {
      // Fetch Thai holidays from Google Calendar public ICS feed
      const response = await fetch("https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics");
      if (!response.ok) {
        throw new Error("Failed to fetch holidays");
      }
      const icsData = await response.text();

      const holidays = [];
      const lines = icsData.split(/\r?\n/);
      let currentEvent = null;

      for (const line of lines) {
        if (line.startsWith("BEGIN:VEVENT")) {
          currentEvent = {};
        } else if (line.startsWith("END:VEVENT")) {
          if (currentEvent && currentEvent.date && currentEvent.name) {
            holidays.push(currentEvent);
          }
          currentEvent = null;
        } else if (currentEvent) {
          if (line.startsWith("DTSTART;VALUE=DATE:")) {
            const dateStr = line.substring("DTSTART;VALUE=DATE:".length);
            if (dateStr.length === 8) {
              currentEvent.date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            }
          } else if (line.startsWith("SUMMARY:")) {
            currentEvent.name = line.substring("SUMMARY:".length);
          }
        }
      }

      res.json({ holidays });
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  app.post("/api/smart-import", async (req, res) => {
    try {
      // Check if API key is configured
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        return res.status(400).json({
          error: "Gemini API key not configured. Smart Import requires a free API key.",
          helpUrl: "https://aistudio.google.com/apikey"
        });
      }

      // Check free tier limit before making the call
      const currentCount = getUsageCount('smart-import');
      const limit = FREE_TIER_LIMITS['smart-import'].daily;
      if (currentCount >= limit) {
        return res.status(429).json({
          error: `Daily free tier limit reached (${currentCount}/${limit}). Resets tomorrow.`,
          level: 'exceeded'
        });
      }

      const { base64Data, mimeType, currentDateStr, people } = req.body;
      const modelName = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `
        Analyze this schedule image.
        The current month is ${currentDateStr}.
        Here is the list of available personnel: ${JSON.stringify(people)}.
        Extract the shifts and return a JSON array of objects with this exact structure:
        [
          { "date": "YYYY-MM-DD", "personId": "matched_id_from_list", "level": "1A" | "1B" | "2" | "3" }
        ]
        Map the names in the image to the closest personId. 
        1A is usually "เวรบน" or "1st Call Top".
        1B is usually "เวรล่าง" or "1st Call Bottom".
        2 is "Second Call" or "เวร 2".
        3 is "Third Call" or "เวร 3".
        CRITICAL INSTRUCTION: ONLY return shifts for slots that ACTUALLY HAVE A NAME written in them in the image. DO NOT guess or fill in empty slots. If a slot is empty in the image, DO NOT include it in the JSON array.
        Only return the JSON array. Do not include markdown formatting like json.
      `;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      });

      // Track usage AFTER successful call
      const newCount = incrementUsage('smart-import');

      let extractedText = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.text) {
          extractedText += part.text;
        }
      }

      let extractedShifts = [];
      try {
        let text = extractedText || "[]";
        text = text.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
        extractedShifts = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
        return res.status(500).json({ error: "Failed to parse schedule data from image." });
      }

      // Return shifts + usage info
      const pct = Math.round((newCount / limit) * 100);
      res.json({
        shifts: extractedShifts,
        usage: {
          used: newCount,
          limit,
          percentage: pct,
          level: pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok'
        }
      });
    } catch (error) {
      console.error("Smart import error:", error);
      const status = Number((error as any)?.status || (error as any)?.response?.status || 500);
      if (status === 429) {
        return res.status(429).json({
          error: "Gemini quota exceeded for this API key. Please wait for quota reset or use another key.",
          code: "GEMINI_QUOTA_EXCEEDED",
        });
      }
      if (status === 400) {
        return res.status(400).json({
          error: "Gemini could not read this image. Please upload a clearer schedule image and try again.",
          code: "GEMINI_INVALID_IMAGE",
        });
      }
      if (status === 401 || status === 403) {
        return res.status(401).json({
          error: "Gemini API key rejected. Please verify your API key.",
          code: "GEMINI_AUTH_FAILED",
        });
      }
      res.status(500).json({ error: "Internal server error during smart import." });
    }
  });

  // --- Database API Routes ---

  app.get("/api/workspaces", (req, res) => {
    try {
      const workspaces = listWorkspaces(db);
      res.json({ workspaces });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to list workspaces" });
    }
  });

  app.post("/api/workspaces", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const timezone = String(req.body?.timezone || "UTC").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      const workspace = createWorkspace(db, { name, timezone });
      res.json({ workspace });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create workspace" });
    }
  });

  app.get("/api/workspaces/:id/ruleset", (req, res) => {
    try {
      const workspaceId = req.params.id || DEFAULT_WORKSPACE_ID;
      const existing = getRuleSet(db, workspaceId);
      if (existing) return res.json({ ruleset: existing });
      const workspace = listWorkspaces(db).find((w) => w.id === workspaceId);
      if (!workspace) return res.status(404).json({ error: "workspace not found" });
      const schedulingConfig = getWorkspaceSchedulingConfig(db, workspaceId) || ensureWorkspaceSchedulingConfig(db, workspaceId);
      const constraints = getWorkspaceConstraints(db, workspaceId) as Constraint[];
      const generated = buildRuleSetFromWorkspaceConfig(workspace, schedulingConfig, constraints);
      const saved = saveRuleSet(db, workspaceId, generated);
      res.json({ ruleset: saved });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch ruleset" });
    }
  });

  app.put("/api/workspaces/:id/ruleset", (req, res) => {
    try {
      const workspaceId = req.params.id || DEFAULT_WORKSPACE_ID;
      const incoming = req.body?.ruleset as RuleSetV1 | undefined;
      if (!incoming) return res.status(400).json({ error: "ruleset is required" });
      const candidate: RuleSetV1 = {
        ...incoming,
        schemaVersion: "ruleset.v1",
        periodKind: "month",
        workspaceId,
        version: incoming.version || 1,
        updatedAt: Date.now(),
      };
      const schedulingConfig = getWorkspaceSchedulingConfig(db, workspaceId) || ensureWorkspaceSchedulingConfig(db, workspaceId);
      const levelRegistry = new Set<string>(['1A', '1B', '2', '3']);
      for (const subset of schedulingConfig.subsets || []) {
        for (const level of subset.levelScopes || []) levelRegistry.add(level);
      }
      const validation = validateRuleSetV1(candidate, levelRegistry);
      if (!validation.ok) return res.status(400).json({ error: validation.errors.join("; ") });
      const saved = saveRuleSet(db, workspaceId, candidate);
      res.json({ ruleset: saved });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update ruleset" });
    }
  });

  app.get("/api/workspaces/:id/scheduling-config", (req, res) => {
    try {
      const workspaceId = req.params.id || DEFAULT_WORKSPACE_ID;
      const config = ensureWorkspaceSchedulingConfig(db, workspaceId);
      res.json({ config });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch scheduling config" });
    }
  });

  app.put("/api/workspaces/:id/scheduling-config", (req, res) => {
    try {
      const workspaceId = req.params.id || DEFAULT_WORKSPACE_ID;
      const incoming = req.body?.config;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ error: "config is required" });
      }
      const candidate = {
        ...incoming,
        version: Number(incoming.version || 1),
        updatedAt: Date.now(),
      };
      const validation = validateWorkspaceSchedulingConfig(candidate);
      if (!validation.ok) {
        return res.status(400).json({
          error: validation.errors.join("; "),
          issues: validation.issues,
        });
      }
      const saved = saveWorkspaceSchedulingConfig(db, workspaceId, candidate);
      res.json({ config: saved });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update scheduling config" });
    }
  });

  // Get all state
  app.get("/api/state", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const shifts = getWorkspaceShifts(db, workspaceId);

      const manualHighlights = db.prepare("SELECT date FROM manual_highlights").all().map((r: any) => r.date);
      const noonDays = db.prepare("SELECT date FROM noon_days").all().map((r: any) => r.date);

      const versionsRaw = db.prepare("SELECT * FROM versions").all();
      const versions = versionsRaw.map((v: any) => ({
        ...v,
        shifts: JSON.parse(v.shifts)
      }));

      const constraintsRaw = getWorkspaceConstraints(db, workspaceId) as Constraint[];
      const ruleset = getRuleSet(db, workspaceId);
      const schedulingConfig = ensureWorkspaceSchedulingConfig(db, workspaceId);
      res.json({ people, shifts, manualHighlights, noonDays, versions, constraints: constraintsRaw, workspaceId, ruleset, schedulingConfig });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch state" });
    }
  });

  app.get("/api/cumulative", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const data = getWorkspaceCumulative(db, workspaceId);
      res.json({ data, source: 'sqlite', updatedAt: Date.now() });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load cumulative data" });
    }
  });

  app.post("/api/cumulative/finalize", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = typeof req.body?.monthKey === "string" ? req.body.monthKey : "";
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }

      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const shifts = getWorkspaceShifts(db, workspaceId)
        .filter((s: any) => s.date.startsWith(monthKey) && (s.level === "2" || s.level === "3"));
      const current = getWorkspaceCumulative(db, workspaceId);
      const byId = new Map(people.map((p: any) => [p.id, p]));

      const suryPeople = people.filter((p: any) => (p.tagIds || []).some((t: string) => SURY_TAGS.includes(t)));
      saveWorkspacePeopleMonthSnapshot(db, workspaceId, monthKey, people);
      const monthSnapshot = getWorkspacePeopleMonthSnapshot(db, workspaceId, monthKey);
      const snapshotById = new Map(monthSnapshot.map((p) => [p.personId, p]));
      const monthShiftIds = new Set(shifts.map((s: any) => s.personId).filter((id: string) => id && id !== "__locked__"));
      const candidateIds = new Set<string>([
        ...suryPeople.map((p: any) => p.id),
        ...monthSnapshot.map((p) => p.personId),
        ...Array.from(monthShiftIds),
      ]);

      for (const personId of candidateIds) {
        const active = byId.get(personId);
        const snapshot = snapshotById.get(personId);
        const prev = current[personId];
        const s = shifts.filter((sh: any) => sh.personId === personId && sh.level === "2").length;
        const t = shifts.filter((sh: any) => sh.personId === personId && sh.level === "3").length;
        current[personId] = {
          name: active?.name || snapshot?.name || prev?.name || personId,
          tagIds: active?.tagIds || snapshot?.tagIds || prev?.tagIds || [],
          months: {
            ...(prev?.months || {}),
            [monthKey]: { s, t },
          },
        };
      }

      const saved = saveWorkspaceCumulative(db, workspaceId, current);
      res.json({ success: true, data: saved, finalizedMonth: monthKey, peopleCount: suryPeople.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to finalize cumulative month" });
    }
  });

  app.post("/api/cumulative/rebuild", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const shifts = getWorkspaceShifts(db, workspaceId).filter((s: any) => s.level === "2" || s.level === "3");
      const current = getWorkspaceCumulative(db, workspaceId);
      const snapshots = getWorkspacePeopleMonthSnapshotAll(db, workspaceId);
      const activeById = new Map(people.map((p: any) => [p.id, p]));
      const snapshotById = new Map<string, any>();
      for (const item of snapshots) {
        const prev = snapshotById.get(item.personId);
        if (!prev || String(item.monthKey) > String(prev.monthKey)) {
          snapshotById.set(item.personId, item);
        }
      }
      const counter = new Map<string, { s: number; t: number }>();
      for (const s of shifts) {
        if (!s.personId || s.personId === "__locked__") continue;
        const mk = String(s.date).slice(0, 7);
        const key = `${s.personId}|${mk}`;
        const prev = counter.get(key) || { s: 0, t: 0 };
        if (s.level === "2") prev.s += 1;
        if (s.level === "3") prev.t += 1;
        counter.set(key, prev);
      }
      const monthMap = new Map<string, Record<string, { s: number; t: number }>>();
      for (const [key, value] of counter.entries()) {
        const [personId, mk] = key.split("|");
        if (!monthMap.has(personId)) monthMap.set(personId, {});
        monthMap.get(personId)![mk] = value;
      }
      const candidateIds = new Set<string>([
        ...Object.keys(current),
        ...people.filter((p: any) => (p.tagIds || []).some((t: string) => SURY_TAGS.includes(t))).map((p: any) => p.id),
        ...snapshots.map((s) => s.personId),
        ...Array.from(monthMap.keys()),
      ]);
      const rebuilt: Record<string, any> = {};
      for (const personId of candidateIds) {
        const active = activeById.get(personId);
        const snapshot = snapshotById.get(personId);
        const prev = current[personId];
        const recomputedMonths = monthMap.get(personId) || {};
        rebuilt[personId] = {
          name: active?.name || snapshot?.name || prev?.name || personId,
          tagIds: active?.tagIds || snapshot?.tagIds || prev?.tagIds || [],
          months: {
            ...(prev?.months || {}),
            ...recomputedMonths,
          },
        };
      }
      const saved = saveWorkspaceCumulative(db, workspaceId, rebuilt);
      res.json({ success: true, data: saved, rebuiltPeople: Object.keys(saved).length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to rebuild cumulative data" });
    }
  });

  app.get("/api/roster/templates", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const templates = getRosterTemplates(db, workspaceId);
      res.json({ templates });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load roster templates" });
    }
  });

  app.post("/api/roster/templates", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const payload = Array.isArray(req.body?.templates) ? req.body.templates : req.body;
      const templates = saveRosterTemplates(db, workspaceId, payload || []);
      res.json({ templates });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save roster templates" });
    }
  });

  app.get("/api/roster/month/:monthKey", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = req.params.monthKey;
      const roster = resolveMonthRoster(db, workspaceId, monthKey);
      res.json({ roster });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load month roster" });
    }
  });

  app.post("/api/roster/month/:monthKey", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = req.params.monthKey;
      const current = resolveMonthRoster(db, workspaceId, monthKey);
      const nextTemplateId = typeof req.body?.templateId === "string" ? req.body.templateId : current.templateId;
      const nextOverrides = req.body?.overrides && typeof req.body.overrides === "object" ? req.body.overrides : current.overrides;
      const templates = getRosterTemplates(db, workspaceId);
      const template = templates.find((t) => t.id === nextTemplateId) || templates.find((t) => t.isDefault) || templates[0];
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const validIds = new Set(people.map((p) => p.id));
      const included = new Set((template?.baseIncludedPersonIds || []).filter((id) => validIds.has(id)));
      for (const [personId, mode] of Object.entries(nextOverrides)) {
        if (!validIds.has(personId)) continue;
        if (mode === "include") included.add(personId);
        if (mode === "exclude") included.delete(personId);
      }
      const roster = saveMonthRoster(db, workspaceId, {
        monthKey,
        templateId: template?.id || null,
        overrides: nextOverrides,
        includedPersonIds: Array.from(included),
        updatedAt: Date.now(),
      });
      res.json({ roster });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save month roster" });
    }
  });

  // Save people
  app.post("/api/people", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const schedulingConfig = ensureWorkspaceSchedulingConfig(db, workspaceId);
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: "people array is required" });
      }
      const incoming = req.body;
      const people = incoming.map((person: any) => ({
        ...person,
        tagIds: normalizePersonTags(normalizeIncomingTagIds(person?.tagIds), schedulingConfig, { singleRuleGroup: true }),
      }));
      saveWorkspacePeople(db, workspaceId, people);
      if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyPeople(people);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save people" });
    }
  });

  app.patch("/api/people/:id/month/:monthKey/eligibility", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const personId = req.params.id;
      const monthKey = req.params.monthKey;
      const mode = req.body?.mode as "include" | "exclude" | "template";
      if (!["include", "exclude", "template"].includes(mode)) {
        return res.status(400).json({ error: "mode must be include|exclude|template" });
      }

      const roster = resolveMonthRoster(db, workspaceId, monthKey);
      const overrides = { ...roster.overrides };
      if (mode === "template") delete overrides[personId];
      else overrides[personId] = mode;

      const templates = getRosterTemplates(db, workspaceId);
      const template = templates.find((t) => t.id === roster.templateId) || templates.find((t) => t.isDefault) || templates[0];
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const validIds = new Set(people.map((p) => p.id));
      const included = new Set((template?.baseIncludedPersonIds || []).filter((id) => validIds.has(id)));
      for (const [id, ov] of Object.entries(overrides)) {
        if (!validIds.has(id)) continue;
        if (ov === "include") included.add(id);
        if (ov === "exclude") included.delete(id);
      }
      const nextRoster = saveMonthRoster(db, workspaceId, {
        ...roster,
        overrides,
        includedPersonIds: Array.from(included),
      });

      // Auto-clear excluded person's shifts in this month
      if (mode === "exclude") {
        const shifts = getWorkspaceShifts(db, workspaceId);
        const nextShifts = shifts.filter((s: any) => !(s.personId === personId && s.date.startsWith(monthKey)));
        if (nextShifts.length !== shifts.length) {
          saveWorkspaceShifts(db, workspaceId, nextShifts);
          if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyShifts(nextShifts);
        }
      }

      res.json({ roster: nextRoster });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update eligibility" });
    }
  });

  app.patch("/api/people/:id/offdays", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const personId = req.params.id;
      const unavailableDates = Array.isArray(req.body?.unavailableDates) ? req.body.unavailableDates : null;
      if (!unavailableDates) return res.status(400).json({ error: "unavailableDates array is required" });
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const nextPeople = people.map((p: any) => (p.id === personId ? { ...p, unavailableDates } : p));
      saveWorkspacePeople(db, workspaceId, nextPeople);
      if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyPeople(nextPeople);
      res.json({ success: true, people: nextPeople });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update offdays" });
    }
  });

  app.patch("/api/people/:id/tags", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const personId = req.params.id;
      const tagIds = Array.isArray(req.body?.tagIds) ? normalizeIncomingTagIds(req.body.tagIds) : null;
      if (!tagIds) return res.status(400).json({ error: "tagIds array is required" });
      const schedulingConfig = ensureWorkspaceSchedulingConfig(db, workspaceId);
      if (countRuleGroupTags(tagIds, schedulingConfig) > 1) {
        return res.status(400).json({ error: "Only one Rule Group Tag is allowed per person." });
      }
      const normalizedTagIds = normalizePersonTags(tagIds, schedulingConfig, { singleRuleGroup: true });
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const nextPeople = people.map((p: any) => (p.id === personId ? { ...p, tagIds: normalizedTagIds } : p));
      saveWorkspacePeople(db, workspaceId, nextPeople);
      if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyPeople(nextPeople);
      res.json({ success: true, people: nextPeople });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update tags" });
    }
  });

  app.delete("/api/people/:id", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const personId = req.params.id;
      const mode = typeof req.query?.mode === "string" ? req.query.mode : "soft";
      if (mode !== "soft" && mode !== "hard") {
        return res.status(400).json({ error: "mode must be soft|hard" });
      }

      const shifts = getWorkspaceShifts(db, workspaceId);
      const { impactedShifts, preview } = buildDeleteImpact(personId, shifts);

      if (req.query.preview === "1") {
        return res.json({ preview, mode });
      }

      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const targetPerson = people.find((p: any) => p.id === personId);
      if (!targetPerson) {
        return res.status(404).json({ error: "Person not found" });
      }
      const nextPeople = people.filter((p: any) => p.id !== personId);
      const nextShifts = shifts.filter((s: any) => s.personId !== personId);

      if (mode === "soft") {
        const now = Date.now();
        db.prepare(`
          INSERT INTO deleted_people_bin (workspaceId, personId, personJson, deletedShiftsJson, affectedMonthsJson, deletedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(workspaceId, personId) DO UPDATE SET
            personJson = excluded.personJson,
            deletedShiftsJson = excluded.deletedShiftsJson,
            affectedMonthsJson = excluded.affectedMonthsJson,
            deletedAt = excluded.deletedAt,
            updatedAt = excluded.updatedAt
        `).run(
          workspaceId,
          personId,
          JSON.stringify(targetPerson),
          JSON.stringify(impactedShifts),
          JSON.stringify(preview.affectedMonths),
          now,
          now
        );
      }

      saveWorkspacePeople(db, workspaceId, nextPeople);
      saveWorkspaceShifts(db, workspaceId, nextShifts);
      if (workspaceId === DEFAULT_WORKSPACE_ID) {
        syncLegacyPeople(nextPeople);
        syncLegacyShifts(nextShifts);
      }

      res.json({ success: true, mode, preview, people: nextPeople, shifts: nextShifts });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete person" });
    }
  });

  // Clear all shifts for a specific month without revalidating unrelated months
  app.post("/api/shifts/clear-month", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = typeof req.body?.monthKey === "string" ? req.body.monthKey : "";
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }

      const shifts = getWorkspaceShifts(db, workspaceId);
      const nextShifts = shifts.filter((s: any) => !String(s.date || "").startsWith(monthKey));
      saveWorkspaceShifts(db, workspaceId, nextShifts);
      if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyShifts(nextShifts);
      res.json({ success: true, monthKey, shifts: nextShifts });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to clear month shifts" });
    }
  });

  // Save shifts
  app.post("/api/shifts", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const incomingShifts = Array.isArray(req.body) ? req.body : [];
      const people = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const validIds = new Set(people.map((p: any) => p.id));
      const shifts = incomingShifts.filter((s: any) => s?.personId === "__locked__" || validIds.has(s?.personId));
      const conflicts = findMultiLevelSameDayConflicts(shifts);
      if (conflicts.length > 0) {
        return res.status(400).json({
          error: "A person can only hold one shift type per day.",
          details: conflicts,
        });
      }
      saveWorkspaceShifts(db, workspaceId, shifts);
      if (workspaceId === DEFAULT_WORKSPACE_ID) syncLegacyShifts(shifts);
      res.json({ success: true, droppedUnknownPeople: Math.max(0, incomingShifts.length - shifts.length) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save shifts" });
    }
  });

  // Save highlights & noon days
  app.post("/api/highlights", (req, res) => {
    try {
      const { manualHighlights, noonDays } = req.body;

      const saveHighlights = db.transaction(() => {
        db.prepare("DELETE FROM manual_highlights").run();
        const insertH = db.prepare("INSERT INTO manual_highlights (date) VALUES (?)");
        for (const date of manualHighlights || []) insertH.run(date);

        db.prepare("DELETE FROM noon_days").run();
        const insertN = db.prepare("INSERT INTO noon_days (date) VALUES (?)");
        for (const date of noonDays || []) insertN.run(date);
      });

      saveHighlights();
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save highlights" });
    }
  });

  // Versions API
  const monthKeyFromReq = (req: any): string => {
    const fromParam = typeof req.params?.monthKey === "string" ? req.params.monthKey : "";
    const fromQuery = typeof req.query?.monthKey === "string" ? req.query.monthKey : "";
    const fromBody = typeof req.body?.monthKey === "string" ? req.body.monthKey : "";
    return fromParam || fromQuery || fromBody || "";
  };

  const loadMonthLock = (workspaceId: string, monthKey: string) => {
    const row = db.prepare(`
      SELECT workspaceId, monthKey, versionId, shifts, people, lockedAt
      FROM month_locked_versions
      WHERE workspaceId = ? AND monthKey = ?
    `).get(workspaceId, monthKey) as any;
    if (!row) return null;
    return {
      workspaceId: row.workspaceId,
      monthKey: row.monthKey,
      versionId: row.versionId,
      shifts: JSON.parse(row.shifts),
      people: JSON.parse(row.people),
      lockedAt: row.lockedAt,
    };
  };

  const handleGetMonthLock = (req: any, res: any) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = monthKeyFromReq(req);
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }
      return res.json({ locked: loadMonthLock(workspaceId, monthKey) });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to load month lock", details: [String(error?.message || error)] });
    }
  };

  const handleLockMonth = (req: any, res: any) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = monthKeyFromReq(req);
      const versionId = typeof req.body?.versionId === "string" ? req.body.versionId : "";
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }
      if (!versionId) {
        return res.status(400).json({ error: "versionId is required" });
      }
      const version = db.prepare("SELECT id, month, shifts, timestamp FROM versions WHERE id = ?").get(versionId) as any;
      if (!version) return res.status(404).json({ error: "Version not found" });
      if (version.month !== monthKey) {
        return res.status(400).json({ error: "version month does not match monthKey" });
      }
      const cachedVersionSnapshot = db.prepare(`
        SELECT people
        FROM version_people_snapshots
        WHERE workspaceId = ? AND versionId = ?
      `).get(workspaceId, versionId) as any;
      const resolvedPeople = cachedVersionSnapshot?.people
        ? JSON.parse(cachedVersionSnapshot.people)
        : parseWorkspacePeople(getWorkspacePeople(db, workspaceId)).map((p: any) => ({
            personId: p.id,
            name: p.name,
            color: p.color ?? null,
            role: p.role ?? null,
            subset: p.subset ?? null,
            tagIds: p.tagIds || [],
          }));
      const lockedAt = Date.now();
      db.prepare(`
        INSERT INTO month_locked_versions (workspaceId, monthKey, versionId, shifts, people, lockedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspaceId, monthKey) DO UPDATE SET
          versionId = excluded.versionId,
          shifts = excluded.shifts,
          people = excluded.people,
          lockedAt = excluded.lockedAt
      `).run(workspaceId, monthKey, versionId, version.shifts, JSON.stringify(resolvedPeople), lockedAt);
      db.prepare(`
        INSERT INTO version_people_snapshots (workspaceId, versionId, people, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspaceId, versionId) DO UPDATE SET
          people = excluded.people,
          updatedAt = excluded.updatedAt
      `).run(workspaceId, versionId, JSON.stringify(resolvedPeople), lockedAt);
      return res.json({ success: true, locked: loadMonthLock(workspaceId, monthKey) });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to lock month version", details: [String(error?.message || error)] });
    }
  };

  const handleUnlockMonth = (req: any, res: any) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const monthKey = monthKeyFromReq(req);
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }
      const expectedCode = `${monthKey.slice(5, 7)}${monthKey.slice(0, 4)}`;
      if (code !== expectedCode) {
        return res.status(403).json({ error: "Invalid unlock code" });
      }
      db.prepare("DELETE FROM month_locked_versions WHERE workspaceId = ? AND monthKey = ?").run(workspaceId, monthKey);
      return res.json({ success: true, monthKey });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to unlock month", details: [String(error?.message || error)] });
    }
  };

  app.get("/api/month-lock", handleGetMonthLock);
  app.get("/api/month-lock/:monthKey", handleGetMonthLock);
  app.post("/api/month-lock/unlock", handleUnlockMonth);
  app.post("/api/month-lock/:monthKey/unlock", handleUnlockMonth);
  app.post("/api/month-lock", handleLockMonth);
  app.post("/api/month-lock/:monthKey", handleLockMonth);

  app.get("/api/versions", (req, res) => {
    try {
      const monthKey = typeof req.query?.monthKey === "string" ? req.query.monthKey : "";
      if (monthKey && !/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }
      const versionsRaw = monthKey
        ? db.prepare("SELECT * FROM versions WHERE month = ? ORDER BY timestamp DESC").all(monthKey)
        : db.prepare("SELECT * FROM versions ORDER BY timestamp DESC").all();
      const versions = versionsRaw.map((v: any) => ({
        ...v,
        shifts: JSON.parse(v.shifts),
      }));
      res.json({ versions });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load versions" });
    }
  });

  app.post("/api/versions/:versionId/restore", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const versionId = req.params.versionId;
      const monthKey = typeof req.body?.monthKey === "string" ? req.body.monthKey : "";
      const conflictMode = req.body?.conflictMode === "overwrite" ? "overwrite" : req.body?.conflictMode === "skip" ? "skip" : null;
      const dryRun = req.body?.dryRun === true;
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }

      const version = db.prepare("SELECT id, month, shifts FROM versions WHERE id = ?").get(versionId) as any;
      if (!version) return res.status(404).json({ error: "Version not found" });
      if (version.month !== monthKey) return res.status(400).json({ error: "version month does not match monthKey" });

      const allShifts = getWorkspaceShifts(db, workspaceId);
      const currentMonthShifts = allShifts.filter((s: any) => String(s.date || "").startsWith(monthKey));
      const otherMonthShifts = allShifts.filter((s: any) => !String(s.date || "").startsWith(monthKey));
      let parsedVersionShifts: unknown = [];
      try {
        parsedVersionShifts = JSON.parse(version.shifts || "[]");
      } catch {
        parsedVersionShifts = [];
      }
      const incomingShiftsRaw = Array.isArray(parsedVersionShifts)
        ? (parsedVersionShifts as Array<{ date: string; personId: string; level: string }>)
        : [];
      const incomingShifts = incomingShiftsRaw.filter((s) => String(s.date || "").startsWith(monthKey));

      const activePeople = parseWorkspacePeople(getWorkspacePeople(db, workspaceId));
      const activeById = new Map(activePeople.map((p: any) => [p.id, p]));
      const incomingPersonIds = Array.from(new Set(
        incomingShifts
          .map((s) => s.personId)
          .filter((personId): personId is string => !!personId && personId !== "__locked__")
      ));
      const missingPersonIds = incomingPersonIds.filter((personId) => !activeById.has(personId));
      const restoredPeople: any[] = [];
      for (const personId of missingPersonIds) {
        const row = db.prepare(`
          SELECT personJson
          FROM deleted_people_bin
          WHERE workspaceId = ? AND personId = ?
        `).get(workspaceId, personId) as any;
        if (!row?.personJson) continue;
        try {
          const parsed = JSON.parse(row.personJson);
          if (parsed?.id && parsed?.name) restoredPeople.push(parsed);
        } catch {
          // ignore malformed deleted snapshot
        }
      }
      const finalPeople = [...activePeople, ...restoredPeople.filter((p) => !activeById.has(p.id))];
      const finalPeopleIds = new Set(finalPeople.map((p: any) => p.id));

      const currentBySlot = new Map<string, { date: string; personId: string; level: string }>();
      for (const shift of currentMonthShifts) {
        currentBySlot.set(`${shift.date}|${shift.level}`, shift);
      }

      const conflicts: Array<{ date: string; level: string; existingPersonId: string; incomingPersonId: string }> = [];
      for (const incoming of incomingShifts) {
        const key = `${incoming.date}|${incoming.level}`;
        const existing = currentBySlot.get(key);
        if (!existing || existing.personId === incoming.personId) continue;
        conflicts.push({
          date: incoming.date,
          level: incoming.level,
          existingPersonId: existing.personId,
          incomingPersonId: incoming.personId,
        });
      }

      if (dryRun) {
        return res.json({
          success: true,
          dryRun: true,
          requiresConflictResolution: conflicts.length > 0,
          conflicts,
          summary: {
            restoredPeopleCount: restoredPeople.length,
            restoredShiftCount: 0,
            skippedConflictCount: conflicts.length,
            overwrittenCount: 0,
            monthKey,
          },
        });
      }

      if (conflicts.length > 0 && !conflictMode) {
        return res.status(409).json({
          error: "Conflict mode required",
          requiresConflictResolution: true,
          conflicts,
        });
      }

      const monthResultBySlot = new Map<string, { date: string; personId: string; level: string }>();
      for (const shift of currentMonthShifts) {
        monthResultBySlot.set(`${shift.date}|${shift.level}`, shift);
      }

      let restoredShiftCount = 0;
      let skippedConflictCount = 0;
      let overwrittenCount = 0;
      for (const incoming of incomingShifts) {
        if (incoming.personId !== "__locked__" && !finalPeopleIds.has(incoming.personId)) continue;
        const key = `${incoming.date}|${incoming.level}`;
        const existing = monthResultBySlot.get(key);
        if (!existing) {
          monthResultBySlot.set(key, incoming);
          restoredShiftCount += 1;
          continue;
        }
        if (existing.personId === incoming.personId) continue;
        if (conflictMode === "overwrite") {
          monthResultBySlot.set(key, incoming);
          restoredShiftCount += 1;
          overwrittenCount += 1;
        } else {
          skippedConflictCount += 1;
        }
      }

      const mergedShifts = [...otherMonthShifts, ...Array.from(monthResultBySlot.values())];
      saveWorkspacePeople(db, workspaceId, finalPeople);
      saveWorkspaceShifts(db, workspaceId, mergedShifts);
      if (workspaceId === DEFAULT_WORKSPACE_ID) {
        syncLegacyPeople(finalPeople);
        syncLegacyShifts(mergedShifts);
      }

      return res.json({
        success: true,
        people: finalPeople,
        shifts: mergedShifts,
        conflicts,
        summary: {
          restoredPeopleCount: restoredPeople.length,
          restoredShiftCount,
          skippedConflictCount,
          overwrittenCount,
          monthKey,
        },
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to restore version", details: [String(error?.message || error)] });
    }
  });

  app.post("/api/versions", (req, res) => {
    try {
      const payload = req.body;
      const insert = db.prepare("INSERT INTO versions (id, name, timestamp, month, shifts) VALUES (@id, @name, @timestamp, @month, @shifts)");
      const replaceAll = db.transaction((items: any[]) => {
        db.prepare("DELETE FROM versions").run();
        for (const item of items) {
          insert.run({ ...item, name: typeof item?.name === "string" ? item.name : null, shifts: JSON.stringify(item.shifts) });
        }
      });
      const replaceByMonth = db.transaction((targetMonth: string, items: any[]) => {
        db.prepare("DELETE FROM versions WHERE month = ?").run(targetMonth);
        for (const item of items) {
          insert.run({
            ...item,
            name: typeof item?.name === "string" ? item.name : null,
            month: targetMonth,
            shifts: JSON.stringify(Array.isArray(item.shifts) ? item.shifts.filter((s: any) => String(s?.date || "").startsWith(targetMonth)) : []),
          });
        }
      });

      // Backward-compatible mode: full list replace
      if (Array.isArray(payload)) {
        replaceAll(payload);
        return res.json({ success: true, mode: "all" });
      }

      const monthKey = typeof payload?.monthKey === "string" ? payload.monthKey : "";
      const versions = Array.isArray(payload?.versions) ? payload.versions : [];
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.status(400).json({ error: "monthKey must be YYYY-MM" });
      }
      replaceByMonth(monthKey, versions);
      res.json({ success: true, mode: "month", monthKey, count: versions.length });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to save versions", details: [String(error?.message || error)] });
    }
  });
 
  // Save constraints
  app.post("/api/constraints", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const constraints = Array.isArray(req.body) ? req.body : [];
      saveWorkspaceConstraints(db, workspaceId, constraints);
      const workspace = listWorkspaces(db).find((w) => w.id === workspaceId) || ensureDefaultWorkspace(db);
      const schedulingConfig = getWorkspaceSchedulingConfig(db, workspaceId) || ensureWorkspaceSchedulingConfig(db, workspaceId);
      const generated = buildRuleSetFromWorkspaceConfig(workspace, schedulingConfig, constraints);
      saveRuleSet(db, workspaceId, generated);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save constraints" });
    }
  });

  const handleSolve = (req: any, res: any, forcedWorkspaceId?: string) => {
    try {
      const workspaceId = forcedWorkspaceId || resolveWorkspaceId(req);
      const { year, month, mode, seed, cumulativeWeights, existingShifts, extraAssignmentsByDay } = normalizeSolveInput(req.body); // month is 1-indexed
      if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return res.status(400).json({ error: "year and month are required" });
      }
      if (month < 1 || month > 12) {
        return res.status(400).json({ error: "month must be between 1 and 12" });
      }
      if (year < 1900 || year > 3000) {
        return res.status(400).json({ error: "year must be between 1900 and 3000" });
      }

      const rawPeople = getWorkspacePeople(db, workspaceId);

      if (rawPeople.length === 0) {
        return res.status(400).json({ error: "No personnel found. Please add team members first." });
      }

      const monthKey = toMonthKey(year, month);
      const roster = resolveMonthRoster(db, workspaceId, monthKey);
      const includedSet = new Set(roster.includedPersonIds);

      const members: Member[] = rawPeople
      .filter((p) => includedSet.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color || '#6b7280',
        tags: safeParseStringArray(p.tagIds),
        active: true,
        role: p.role || undefined,
        subset: p.subset || undefined,
        group: p.group || undefined,
      }));

      if (members.length === 0) {
        return res.status(400).json({ error: `No included personnel for ${monthKey}. Update month roster first.` });
      }

      // Build off-day constraints from each person's unavailableDates
      const offConstraints: OffConstraint[] = [];
      for (const p of rawPeople) {
        if (!includedSet.has(p.id)) continue;
        const dates = safeParseStringArray(p.unavailableDates);
        for (const dateStr of dates) {
          const [y, m, d] = dateStr.split('-').map(Number);
          if (y === year && m === month) {
            offConstraints.push({ memberId: p.id, date: d, type: 'off' });
          }
        }
      }

      const schedulingConfig = getWorkspaceSchedulingConfig(db, workspaceId) || ensureWorkspaceSchedulingConfig(db, workspaceId);
      const subsetDefs = toSubsetTagsFromWorkspaceConfig(schedulingConfig);
      const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
      const noonDaysRaw = db.prepare("SELECT date FROM noon_days").all().map((r: any) => String(r.date || ""));
      const noonDays = noonDaysRaw
        .filter((date: string) => date.startsWith(monthPrefix))
        .map((date: string) => Number(date.slice(8, 10)))
        .filter((day: number) => Number.isInteger(day) && day >= 1);
      const config: MonthConfig = {
        constraints: offConstraints,
        confDays: [],
        noonDays: noonDays.map((date) => ({ date })),
        r1picks: {},
        existingShifts,
        subsets: subsetDefs,
        cumulativeWeights,
      };

      const daysInMonth = getDaysInMonth(year, month - 1);
      const personById = new Map(rawPeople.map((p: any) => [p.id, p]));
      const subset1stIds = new Set(subsetDefs.filter(s => s.eligible1st).map(s => s.id));
      const subset2ndIds = new Set(subsetDefs.filter(s => s.eligible2nd).map(s => s.id));
      const hasTag = (m: Member, tagId: string) => m.tags.includes(tagId) || m.role === tagId || m.subset === tagId;
      const firstPool = members.filter((m) => hasTag(m, "first_call") || [...subset1stIds].some((id) => hasTag(m, id)));
      const secondPool = members.filter((m) => hasTag(m, "second_call") || [...subset2ndIds].some((id) => hasTag(m, id)));
      const precheckWarnings: string[] = [];
      if (secondPool.length === 0) {
        precheckWarnings.push("No personnel tagged as second_call.");
      }
      if (mode === "all" && firstPool.length < 2) {
        precheckWarnings.push("Less than two personnel tagged as first_call; some days may remain unfilled.");
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const secondAvailable = secondPool.some((m) => {
          const dates = safeParseStringArray(personById.get(m.id)?.unavailableDates);
          return !dates.includes(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        });
        if (!secondAvailable && secondPool.length > 0) {
          precheckWarnings.push(`Day ${d}: all second_call personnel are unavailable.`);
        }
      }

      // Always rebuild ruleset from current config so code changes (e.g. noon severity) take effect immediately.
      const workspace = listWorkspaces(db).find((w) => w.id === workspaceId) || ensureDefaultWorkspace(db);
      const constraints = getWorkspaceConstraints(db, workspaceId) as Constraint[];
      const ruleSet = buildRuleSetFromWorkspaceConfig(workspace, schedulingConfig, constraints);
      const levelRegistry = new Set<string>(['1A', '1B', '2', '3']);
      for (const subset of schedulingConfig.subsets || []) {
        for (const level of subset.levelScopes || []) levelRegistry.add(level);
      }
      const validation = validateRuleSetV1(ruleSet, levelRegistry);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.errors.join('; ') });
      }
      const runV2Solve = () => runUniversalSolve({
        workspaceId,
        period: { kind: "month", year, month },
        mode,
        members,
        config,
        ruleSet,
        schedulingConfig,
        legacyConstraints: getWorkspaceConstraints(db, workspaceId) as Constraint[],
        seed,
        extraAssignmentsByDay,
      });

      const output = runV2Solve();

      logSolverRun(db, {
        workspaceId,
        periodKey: `${year}-${String(month).padStart(2, "0")}`,
        inputHash: output.meta.inputHash,
        cost: output.result.bestC,
        stats: {
          ...output.result.stats,
          solverEngine: "v2",
          scoreBreakdown: output.meta.scoreBreakdown || null,
        },
        violations: output.violations,
      });

      res.json({
        shifts: output.shifts,
        stats: output.result.stats,
        violations: output.violations,
        cost: output.result.bestC,
        meta: {
          ...output.meta,
          precheckWarnings,
        },
        needsHardViolationConfirm: output.meta.needsHardViolationConfirm,
      });
    } catch (error) {
      console.error("Solve error:", error);
      res.status(500).json({ error: "Solver failed: " + (error as Error).message });
    }
  };

  // Run the shift solver (legacy default workspace API)
  app.post("/api/solve", (req, res) => {
    return handleSolve(req, res);
  });

  // Run the shift solver (workspace-scoped API)
  app.post("/api/workspaces/:id/solve", (req, res) => {
    return handleSolve(req, res, req.params.id || DEFAULT_WORKSPACE_ID);
  });

  // Evaluate Violations dynamically
  app.post("/api/violations", (req, res) => {
    try {
      const workspaceId = resolveWorkspaceId(req);
      const { year, month, existingShifts } = normalizeSolveInput(req.body); // month is 1-indexed
      if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return res.status(400).json({ error: "year and month are required" });
      }
      if (month < 1 || month > 12) {
        return res.status(400).json({ error: "month must be between 1 and 12" });
      }
      if (year < 1900 || year > 3000) {
        return res.status(400).json({ error: "year must be between 1900 and 3000" });
      }

      const rawPeople = getWorkspacePeople(db, workspaceId);
      const monthKey = toMonthKey(year, month);
      const roster = resolveMonthRoster(db, workspaceId, monthKey);
      const includedSet = new Set(roster.includedPersonIds);

      const members: Member[] = rawPeople
      .filter((p) => includedSet.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color || '#6b7280',
        tags: safeParseStringArray(p.tagIds),
        active: true,
        role: p.role || undefined,
        subset: p.subset || undefined,
        group: p.group || undefined,
      }));

      // Build off-day constraints
      const offByDay: Record<number, Set<string>> = {};
      const daysInMonth = getDaysInMonth(year, month - 1); // 0-indexed month for utility
      for (let d = 1; d <= daysInMonth; d++) offByDay[d] = new Set();

      for (const p of rawPeople) {
        if (!includedSet.has(p.id)) continue;
        const dates = safeParseStringArray(p.unavailableDates);
        for (const dateStr of dates) {
          const [y, m, d] = dateStr.split('-').map(Number);
          if (y === year && m === month && d >= 1 && d <= daysInMonth) {
            offByDay[d].add(p.id);
          }
        }
      }

      const best: Slot[] = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        const ex = (existingShifts[d] || { f1: "", f2: "", sec: "", thi: null }) as Slot;
        return {
          f1: ex.f1 === '__locked__' ? '' : (ex.f1 || ''),
          f2: ex.f2 === '__locked__' ? '' : (ex.f2 || ''),
          sec: ex.sec === '__locked__' ? '' : (ex.sec || ''),
          thi: ex.thi === '__locked__' ? null : (ex.thi || null)
        };
      });

      const violations = analyzeViolations(best, daysInMonth, offByDay, members, DEFAULT_SUBSETS);
      res.json({ violations });
    } catch (error) {
      console.error("Violation check error:", error);
      res.status(500).json({ error: "Failed to evaluate rules" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => {
      res.sendFile("index.html", { root: "dist" });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
