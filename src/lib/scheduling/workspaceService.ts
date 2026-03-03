import type Database from 'better-sqlite3';
import { DEFAULT_SUBSETS } from '../shiftplan/constants';
import type { Constraint } from '../shiftplan/types';
import { buildLegacyBackedRuleSet } from './legacyAdapter';
import { validateRuleSetV1, validateWorkspaceSchedulingConfig } from './validator';
import type { RuleSetV1, Workspace, WorkspaceFairnessCohort, WorkspaceSchedulingConfig } from './types';

export const DEFAULT_WORKSPACE_ID = 'default';

export type MonthRosterOverride = 'include' | 'exclude';

export interface RosterTemplate {
  id: string;
  name: string;
  baseIncludedPersonIds: string[];
  isDefault: boolean;
  updatedAt: number;
}

export interface MonthRoster {
  monthKey: string; // YYYY-MM
  templateId: string | null;
  overrides: Record<string, MonthRosterOverride>;
  includedPersonIds: string[];
  updatedAt: number;
}

export interface CumulativeMonthRecord {
  s: number;
  t: number;
}

export interface WorkspaceCumulativePerson {
  name: string;
  tagIds: string[];
  months: Record<string, CumulativeMonthRecord>;
}

export interface WorkspacePeopleMonthSnapshot {
  monthKey: string;
  personId: string;
  name: string;
  color: string | null;
  role: string | null;
  subset: string | null;
  group: string | null;
  tagIds: string[];
  updatedAt: number;
}

export interface WorkspaceConstraint {
  id: string;
  name: string;
  targetTagId: string | null;
  condition: string | null;
  value: string | null;
}

function defaultFairnessCohorts(): WorkspaceFairnessCohort[] {
  return [
    {
      id: 'cohort-2nd3rd-core',
      name: 'R2/R3 Core Balance',
      memberTagIds: ['r2sry', 'r3sry', 'r3sir'],
      slotScope: ['2', '3'],
      hardCapGap: 1,
      enforceTotal: true,
      enforceHoliday: true,
      enforceNoon: true,
      noonSlotScope: ['2'],
      enabled: true,
    },
  ];
}

export function initWorkspaceSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_people (
      workspaceId TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      role TEXT,
      subset TEXT,
      unavailableDates TEXT,
      targetTotal INTEGER,
      targetHoliday INTEGER,
      targetWeekday INTEGER,
      "group" TEXT,
      tagIds TEXT,
      PRIMARY KEY (workspaceId, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_shifts (
      workspaceId TEXT NOT NULL,
      date TEXT NOT NULL,
      personId TEXT NOT NULL,
      level TEXT NOT NULL,
      lockState TEXT,
      PRIMARY KEY (workspaceId, date, personId, level)
    );

    CREATE TABLE IF NOT EXISTS rulesets (
      workspaceId TEXT NOT NULL,
      version INTEGER NOT NULL,
      schemaVersion TEXT NOT NULL,
      rulesJson TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId)
    );

    CREATE TABLE IF NOT EXISTS solver_runs (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      periodKey TEXT NOT NULL,
      inputHash TEXT NOT NULL,
      cost REAL,
      statsJson TEXT,
      violationsJson TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roster_templates (
      workspaceId TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      baseIncludedPersonIds TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId, id)
    );

    CREATE TABLE IF NOT EXISTS month_rosters (
      workspaceId TEXT NOT NULL,
      monthKey TEXT NOT NULL,
      templateId TEXT,
      overrides TEXT NOT NULL,
      includedPersonIds TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId, monthKey)
    );

    CREATE TABLE IF NOT EXISTS workspace_cumulative (
      workspaceId TEXT NOT NULL,
      personId TEXT NOT NULL,
      name TEXT NOT NULL,
      tagIds TEXT NOT NULL,
      monthsJson TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId, personId)
    );

    CREATE TABLE IF NOT EXISTS workspace_constraints (
      workspaceId TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      targetTagId TEXT,
      condition TEXT,
      value TEXT,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_people_month_snapshots (
      workspaceId TEXT NOT NULL,
      monthKey TEXT NOT NULL,
      personId TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      role TEXT,
      subset TEXT,
      "group" TEXT,
      tagIds TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (workspaceId, monthKey, personId)
    );

    CREATE TABLE IF NOT EXISTS workspace_scheduling_config (
      workspaceId TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      configJson TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
}

export function ensureDefaultWorkspace(db: Database): Workspace {
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(DEFAULT_WORKSPACE_ID) as Workspace | undefined;
  if (existing) return existing;

  db.prepare('INSERT INTO workspaces (id, name, timezone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(DEFAULT_WORKSPACE_ID, 'Medicine', 'Asia/Bangkok', now, now);

  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Medicine',
    timezone: 'Asia/Bangkok',
    createdAt: now,
    updatedAt: now,
  };
}

function hasWorkspaceRows(db: Database, table: 'workspace_people' | 'workspace_shifts'): boolean {
  const row = db.prepare(`SELECT 1 as ok FROM ${table} WHERE workspaceId = ? LIMIT 1`).get(DEFAULT_WORKSPACE_ID) as { ok: number } | undefined;
  return !!row?.ok;
}

export function migrateLegacyToDefaultWorkspace(db: Database) {
  const workspace = ensureDefaultWorkspace(db);

  if (!hasWorkspaceRows(db, 'workspace_people')) {
    const legacyPeople = db.prepare('SELECT * FROM people').all() as any[];
    const insert = db.prepare(`
      INSERT OR REPLACE INTO workspace_people (workspaceId, id, name, color, role, subset, unavailableDates, targetTotal, targetHoliday, targetWeekday, "group", tagIds)
      VALUES (@workspaceId, @id, @name, @color, @role, @subset, @unavailableDates, @targetTotal, @targetHoliday, @targetWeekday, @group, @tagIds)
    `);
    const tx = db.transaction((items: any[]) => {
      for (const p of items) {
        insert.run({ workspaceId: workspace.id, ...p });
      }
    });
    tx(legacyPeople);
  }

  if (!hasWorkspaceRows(db, 'workspace_shifts')) {
    const legacyShifts = db.prepare('SELECT * FROM shifts').all() as any[];
    const insert = db.prepare('INSERT OR REPLACE INTO workspace_shifts (workspaceId, date, personId, level, lockState) VALUES (?, ?, ?, ?, NULL)');
    const tx = db.transaction((items: any[]) => {
      for (const s of items) insert.run(workspace.id, s.date, s.personId, s.level);
    });
    tx(legacyShifts);
  }

  const rulesetExists = db.prepare('SELECT 1 as ok FROM rulesets WHERE workspaceId = ? LIMIT 1').get(workspace.id) as { ok: number } | undefined;
  if (!rulesetExists) {
    const constraints = db.prepare('SELECT * FROM constraints_store').all() as Constraint[];
    const generated = buildLegacyBackedRuleSet(workspace, constraints);
    saveRuleSet(db, generated.workspaceId, generated);
  }

  migrateLegacyConstraintsToWorkspace(db, workspace.id);
  ensureWorkspaceSchedulingConfig(db, workspace.id);
}

export function migrateLegacyConstraintsToWorkspace(db: Database, workspaceId: string) {
  const exists = db.prepare('SELECT 1 as ok FROM workspace_constraints WHERE workspaceId = ? LIMIT 1').get(workspaceId) as { ok: number } | undefined;
  if (exists?.ok) return;
  const legacy = db.prepare('SELECT id, name, targetTagId, condition, value FROM constraints_store').all() as WorkspaceConstraint[];
  if (!legacy.length) return;
  saveWorkspaceConstraints(db, workspaceId, legacy);
}

export function listWorkspaces(db: Database): Workspace[] {
  return db.prepare('SELECT * FROM workspaces ORDER BY createdAt ASC').all() as Workspace[];
}

export function createWorkspace(db: Database, payload: Pick<Workspace, 'name' | 'timezone'>): Workspace {
  const now = Date.now();
  const id = `${payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO workspaces (id, name, timezone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, payload.name, payload.timezone || 'UTC', now, now);

  const workspace: Workspace = { id, name: payload.name, timezone: payload.timezone || 'UTC', createdAt: now, updatedAt: now };
  const generated = buildLegacyBackedRuleSet(workspace, []);
  saveRuleSet(db, workspace.id, generated);
  ensureWorkspaceSchedulingConfig(db, workspace.id);
  return workspace;
}

export function getRuleSet(db: Database, workspaceId: string): RuleSetV1 | null {
  const row = db.prepare('SELECT * FROM rulesets WHERE workspaceId = ?').get(workspaceId) as any;
  if (!row) return null;
  return {
    schemaVersion: row.schemaVersion,
    workspaceId,
    version: row.version,
    periodKind: 'month',
    rules: JSON.parse(row.rulesJson),
    updatedAt: row.updatedAt,
  } as RuleSetV1;
}

export function saveRuleSet(db: Database, workspaceId: string, ruleSet: RuleSetV1): RuleSetV1 {
  const validation = validateRuleSetV1(ruleSet);
  if (!validation.ok) {
    throw new Error(`Invalid ruleset: ${validation.errors.join('; ')}`);
  }

  const current = getRuleSet(db, workspaceId);
  const nextVersion = (current?.version || 0) + 1;
  const stored: RuleSetV1 = {
    ...ruleSet,
    workspaceId,
    version: nextVersion,
    updatedAt: Date.now(),
  };

  db.prepare(`
    INSERT INTO rulesets (workspaceId, version, schemaVersion, rulesJson, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspaceId) DO UPDATE SET
      version = excluded.version,
      schemaVersion = excluded.schemaVersion,
      rulesJson = excluded.rulesJson,
      updatedAt = excluded.updatedAt
  `).run(workspaceId, stored.version, stored.schemaVersion, JSON.stringify(stored.rules), stored.updatedAt);

  return stored;
}

function buildDefaultSchedulingConfig(workspaceId: string, legacyConstraints: WorkspaceConstraint[] = []): WorkspaceSchedulingConfig {
  const now = Date.now();
  const tags = [
    { id: 'first_call', label: '1st Call', color: 'bg-emerald-50 text-emerald-700', active: true },
    { id: 'second_call', label: '2nd Call', color: 'bg-amber-50 text-amber-700', active: true },
    { id: 'third_call', label: '3rd Call', color: 'bg-sky-50 text-sky-700', active: true },
    ...DEFAULT_SUBSETS.map((s) => ({
      id: s.id,
      label: s.name,
      color: s.color,
      active: true,
    })),
  ];
  const subsets = DEFAULT_SUBSETS.map((s, idx) => ({
    id: s.id,
    name: s.name,
    tagIds: [s.id],
    levelScopes: [
      ...(s.eligible1st ? ['1A', '1B'] : []),
      ...(s.eligible2nd ? ['2'] : []),
      ...(s.eligible3rd ? ['3'] : []),
    ],
    active: true,
    priority: s.summaryOrder ?? idx + 1,
    mutuallyExclusiveWith: s.mutuallyExclusiveWith,
    pullTag: s.pullTag,
    maxShifts: s.maxShifts,
    exactShifts: s.exactShifts,
    balanceGroup: s.balanceGroup,
  }));
  const ruleTemplates = [
    {
      id: 'single-shift',
      type: 'single_shift_per_day' as const,
      enabled: true,
      hard: true,
      params: { scope: 'all_levels' },
    },
    ...legacyConstraints.map((c) => ({
      id: `legacy-${c.id}`,
      type: c.condition === 'no_consecutive_holidays' ? 'sequence_gap' as const : 'count_limit' as const,
      enabled: true,
      hard: true,
      params: {
        tagId: c.targetTagId || '',
        max: c.condition?.startsWith('max_') ? Number(c.value || 0) : undefined,
        minGapDays: c.condition === 'no_consecutive_holidays' ? 1 : undefined,
      },
    })),
  ];
  const fairnessCohorts = defaultFairnessCohorts();
  return {
    version: 1,
    tags,
    subsets,
    ruleTemplates,
    fairnessCohorts,
    updatedAt: now,
  };
}

function mergeSubsetLegacyKnobs(config: WorkspaceSchedulingConfig): WorkspaceSchedulingConfig {
  const defaultsById = new Map(DEFAULT_SUBSETS.map((s) => [s.id, s]));
  let changed = false;
  const subsets = (config.subsets || []).map((subset) => {
    const base = defaultsById.get(subset.id);
    if (!base) return subset;
    const next = { ...subset };
    if (next.mutuallyExclusiveWith == null && base.mutuallyExclusiveWith != null) {
      next.mutuallyExclusiveWith = base.mutuallyExclusiveWith;
      changed = true;
    }
    if (next.pullTag == null && base.pullTag != null) {
      next.pullTag = base.pullTag;
      changed = true;
    }
    if (next.maxShifts == null && base.maxShifts != null) {
      next.maxShifts = base.maxShifts;
      changed = true;
    }
    if (next.exactShifts == null && base.exactShifts != null) {
      next.exactShifts = base.exactShifts;
      changed = true;
    }
    if (next.balanceGroup == null && base.balanceGroup != null) {
      next.balanceGroup = base.balanceGroup;
      changed = true;
    }
    return next;
  });
  if (!changed) return config;
  return { ...config, subsets, updatedAt: Date.now() };
}

function parseSchedulingConfigJson(value: unknown): WorkspaceSchedulingConfig | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as WorkspaceSchedulingConfig;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getWorkspaceSchedulingConfig(db: Database, workspaceId: string): WorkspaceSchedulingConfig | null {
  const row = db.prepare('SELECT version, configJson, updatedAt FROM workspace_scheduling_config WHERE workspaceId = ?').get(workspaceId) as any;
  if (!row) return null;
  const parsed = parseSchedulingConfigJson(row.configJson);
  if (!parsed) return null;
  return mergeSubsetLegacyKnobs({
    ...parsed,
    version: row.version || parsed.version || 1,
    fairnessCohorts: parsed.fairnessCohorts?.length ? parsed.fairnessCohorts : defaultFairnessCohorts(),
    updatedAt: row.updatedAt || parsed.updatedAt || Date.now(),
  });
}

export function saveWorkspaceSchedulingConfig(
  db: Database,
  workspaceId: string,
  input: WorkspaceSchedulingConfig
): WorkspaceSchedulingConfig {
  const validation = validateWorkspaceSchedulingConfig(input);
  if (!validation.ok) {
    throw new Error(`Invalid scheduling config: ${validation.errors.join('; ')}`);
  }
  const current = getWorkspaceSchedulingConfig(db, workspaceId);
  const nextVersion = Math.max((current?.version || 0) + 1, input.version || 1);
  const stored: WorkspaceSchedulingConfig = {
    ...input,
    version: nextVersion,
    updatedAt: Date.now(),
  };
  db.prepare(`
    INSERT INTO workspace_scheduling_config (workspaceId, version, configJson, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspaceId) DO UPDATE SET
      version = excluded.version,
      configJson = excluded.configJson,
      updatedAt = excluded.updatedAt
  `).run(workspaceId, stored.version, JSON.stringify(stored), stored.updatedAt);
  return stored;
}

export function ensureWorkspaceSchedulingConfig(db: Database, workspaceId: string): WorkspaceSchedulingConfig {
  const existing = getWorkspaceSchedulingConfig(db, workspaceId);
  if (existing) {
    const needsCohorts = !existing.fairnessCohorts || existing.fairnessCohorts.length === 0;
    const upgraded = mergeSubsetLegacyKnobs(existing);
    if (needsCohorts) {
      return saveWorkspaceSchedulingConfig(db, workspaceId, { ...upgraded, fairnessCohorts: defaultFairnessCohorts() });
    }
    if (upgraded !== existing) {
      return saveWorkspaceSchedulingConfig(db, workspaceId, upgraded);
    }
    return upgraded;
  }
  const legacyConstraints = getWorkspaceConstraints(db, workspaceId);
  const defaults = buildDefaultSchedulingConfig(workspaceId, legacyConstraints);
  return saveWorkspaceSchedulingConfig(db, workspaceId, defaults);
}

export function getWorkspacePeople(db: Database, workspaceId: string): any[] {
  return db.prepare('SELECT * FROM workspace_people WHERE workspaceId = ?').all(workspaceId) as any[];
}

export function saveWorkspacePeopleMonthSnapshot(
  db: Database,
  workspaceId: string,
  monthKey: string,
  people: any[]
) {
  const now = Date.now();
  const tx = db.transaction((items: any[]) => {
    db.prepare('DELETE FROM workspace_people_month_snapshots WHERE workspaceId = ? AND monthKey = ?').run(workspaceId, monthKey);
    const ins = db.prepare(`
      INSERT INTO workspace_people_month_snapshots
      (workspaceId, monthKey, personId, name, color, role, subset, "group", tagIds, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of items) {
      if (!p?.id || !p?.name) continue;
      ins.run(
        workspaceId,
        monthKey,
        p.id,
        p.name,
        p.color ?? null,
        p.role ?? null,
        p.subset ?? null,
        p.group ?? null,
        JSON.stringify(Array.isArray(p.tagIds) ? p.tagIds : []),
        now
      );
    }
  });
  tx(Array.isArray(people) ? people : []);
}

export function getWorkspacePeopleMonthSnapshot(
  db: Database,
  workspaceId: string,
  monthKey: string
): WorkspacePeopleMonthSnapshot[] {
  const rows = db.prepare(`
    SELECT monthKey, personId, name, color, role, subset, "group", tagIds, updatedAt
    FROM workspace_people_month_snapshots
    WHERE workspaceId = ? AND monthKey = ?
    ORDER BY name ASC
  `).all(workspaceId, monthKey) as any[];
  return rows.map((row) => ({
    monthKey: row.monthKey,
    personId: row.personId,
    name: row.name,
    color: row.color ?? null,
    role: row.role ?? null,
    subset: row.subset ?? null,
    group: row.group ?? null,
    tagIds: safeParseStringArray(row.tagIds),
    updatedAt: row.updatedAt,
  }));
}

export function getWorkspacePeopleMonthSnapshotAll(
  db: Database,
  workspaceId: string
): WorkspacePeopleMonthSnapshot[] {
  const rows = db.prepare(`
    SELECT monthKey, personId, name, color, role, subset, "group", tagIds, updatedAt
    FROM workspace_people_month_snapshots
    WHERE workspaceId = ?
    ORDER BY monthKey ASC, name ASC
  `).all(workspaceId) as any[];
  return rows.map((row) => ({
    monthKey: row.monthKey,
    personId: row.personId,
    name: row.name,
    color: row.color ?? null,
    role: row.role ?? null,
    subset: row.subset ?? null,
    group: row.group ?? null,
    tagIds: safeParseStringArray(row.tagIds),
    updatedAt: row.updatedAt,
  }));
}

function safeParseStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function safeParseObject(value: unknown): Record<string, MonthRosterOverride> {
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, MonthRosterOverride> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === 'include' || v === 'exclude') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function safeParseMonthsObject(value: unknown): Record<string, CumulativeMonthRecord> {
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, CumulativeMonthRecord> = {};
    for (const [monthKey, rec] of Object.entries(parsed as Record<string, any>)) {
      if (!rec || typeof rec !== 'object') continue;
      const s = Number(rec.s);
      const t = Number(rec.t);
      out[monthKey] = {
        s: Number.isFinite(s) ? s : 0,
        t: Number.isFinite(t) ? t : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function prevMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function applyRoster(baseIds: string[], overrides: Record<string, MonthRosterOverride>, validIds: Set<string>): string[] {
  const included = new Set(baseIds.filter((id) => validIds.has(id)));
  for (const [personId, mode] of Object.entries(overrides)) {
    if (!validIds.has(personId)) continue;
    if (mode === 'include') included.add(personId);
    if (mode === 'exclude') included.delete(personId);
  }
  return Array.from(included);
}

export function ensureDefaultRosterTemplate(db: Database, workspaceId: string): RosterTemplate {
  const row = db
    .prepare('SELECT * FROM roster_templates WHERE workspaceId = ? ORDER BY isDefault DESC, updatedAt DESC LIMIT 1')
    .get(workspaceId) as any;
  if (row) {
    return {
      id: row.id,
      name: row.name,
      baseIncludedPersonIds: safeParseStringArray(row.baseIncludedPersonIds),
      isDefault: !!row.isDefault,
      updatedAt: row.updatedAt,
    };
  }

  const people = getWorkspacePeople(db, workspaceId);
  const now = Date.now();
  const template: RosterTemplate = {
    id: `tpl-${Math.random().toString(36).slice(2, 10)}`,
    name: 'Default Template',
    baseIncludedPersonIds: people.map((p) => p.id),
    isDefault: true,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO roster_templates (workspaceId, id, name, baseIncludedPersonIds, isDefault, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workspaceId, template.id, template.name, JSON.stringify(template.baseIncludedPersonIds), 1, now);
  return template;
}

export function getRosterTemplates(db: Database, workspaceId: string): RosterTemplate[] {
  ensureDefaultRosterTemplate(db, workspaceId);
  const rows = db
    .prepare('SELECT * FROM roster_templates WHERE workspaceId = ? ORDER BY isDefault DESC, name ASC')
    .all(workspaceId) as any[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseIncludedPersonIds: safeParseStringArray(row.baseIncludedPersonIds),
    isDefault: !!row.isDefault,
    updatedAt: row.updatedAt,
  }));
}

export function saveRosterTemplates(db: Database, workspaceId: string, templates: RosterTemplate[]): RosterTemplate[] {
  const now = Date.now();
  const normalized = templates
    .filter((t) => t && typeof t.id === 'string' && t.id && typeof t.name === 'string' && t.name.trim())
    .map((t) => ({
      id: t.id,
      name: t.name.trim(),
      baseIncludedPersonIds: Array.isArray(t.baseIncludedPersonIds) ? t.baseIncludedPersonIds : [],
      isDefault: !!t.isDefault,
      updatedAt: now,
    }));

  if (normalized.length === 0) {
    return getRosterTemplates(db, workspaceId);
  }
  if (!normalized.some((t) => t.isDefault)) normalized[0].isDefault = true;

  const tx = db.transaction((items: RosterTemplate[]) => {
    db.prepare('DELETE FROM roster_templates WHERE workspaceId = ?').run(workspaceId);
    const ins = db.prepare(`
      INSERT INTO roster_templates (workspaceId, id, name, baseIncludedPersonIds, isDefault, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const t of items) {
      ins.run(workspaceId, t.id, t.name, JSON.stringify(t.baseIncludedPersonIds), t.isDefault ? 1 : 0, now);
    }
  });
  tx(normalized);
  return getRosterTemplates(db, workspaceId);
}

export function getMonthRosterRow(db: Database, workspaceId: string, monthKey: string): MonthRoster | null {
  const row = db.prepare('SELECT * FROM month_rosters WHERE workspaceId = ? AND monthKey = ?').get(workspaceId, monthKey) as any;
  if (!row) return null;
  return {
    monthKey: row.monthKey,
    templateId: row.templateId ?? null,
    overrides: safeParseObject(row.overrides),
    includedPersonIds: safeParseStringArray(row.includedPersonIds),
    updatedAt: row.updatedAt,
  };
}

export function saveMonthRoster(db: Database, workspaceId: string, monthRoster: MonthRoster): MonthRoster {
  const now = Date.now();
  const clean: MonthRoster = {
    monthKey: monthRoster.monthKey,
    templateId: monthRoster.templateId || null,
    overrides: monthRoster.overrides || {},
    includedPersonIds: monthRoster.includedPersonIds || [],
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO month_rosters (workspaceId, monthKey, templateId, overrides, includedPersonIds, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspaceId, monthKey) DO UPDATE SET
      templateId = excluded.templateId,
      overrides = excluded.overrides,
      includedPersonIds = excluded.includedPersonIds,
      updatedAt = excluded.updatedAt
  `).run(
    workspaceId,
    clean.monthKey,
    clean.templateId,
    JSON.stringify(clean.overrides),
    JSON.stringify(clean.includedPersonIds),
    now
  );
  return { ...clean, updatedAt: now };
}

export function resolveMonthRoster(db: Database, workspaceId: string, monthKey: string): MonthRoster {
  const people = getWorkspacePeople(db, workspaceId);
  const validIds = new Set(people.map((p) => p.id));
  const templates = getRosterTemplates(db, workspaceId);
  const defaultTemplate = templates.find((t) => t.isDefault) || templates[0];

  const current = getMonthRosterRow(db, workspaceId, monthKey);
  if (current) {
    const template = templates.find((t) => t.id === current.templateId) || defaultTemplate;
    const includedPersonIds = applyRoster(template.baseIncludedPersonIds, current.overrides, validIds);
    if (JSON.stringify(includedPersonIds) !== JSON.stringify(current.includedPersonIds)) {
      return saveMonthRoster(db, workspaceId, { ...current, templateId: template.id, includedPersonIds });
    }
    return { ...current, templateId: template.id };
  }

  const prevKey = prevMonthKey(monthKey);
  const prev = prevKey ? getMonthRosterRow(db, workspaceId, prevKey) : null;
  const templateId = prev?.templateId || defaultTemplate.id;
  const template = templates.find((t) => t.id === templateId) || defaultTemplate;
  const overrides = prev?.overrides || {};
  const includedPersonIds = applyRoster(template.baseIncludedPersonIds, overrides, validIds);

  return saveMonthRoster(db, workspaceId, {
    monthKey,
    templateId: template.id,
    overrides,
    includedPersonIds,
    updatedAt: Date.now(),
  });
}

export function saveWorkspacePeople(db: Database, workspaceId: string, people: any[]) {
  const del = db.prepare('DELETE FROM workspace_people WHERE workspaceId = ?');
  const ins = db.prepare(`
    INSERT INTO workspace_people (workspaceId, id, name, color, role, subset, unavailableDates, targetTotal, targetHoliday, targetWeekday, "group", tagIds)
    VALUES (@workspaceId, @id, @name, @color, @role, @subset, @unavailableDates, @targetTotal, @targetHoliday, @targetWeekday, @group, @tagIds)
  `);

  const tx = db.transaction((items: any[]) => {
    del.run(workspaceId);
    for (const item of items) {
      ins.run({
        workspaceId,
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

export function getWorkspaceShifts(db: Database, workspaceId: string): any[] {
  return db.prepare('SELECT date, personId, level FROM workspace_shifts WHERE workspaceId = ?').all(workspaceId) as any[];
}

export function saveWorkspaceShifts(db: Database, workspaceId: string, shifts: any[]) {
  const tx = db.transaction((items: any[]) => {
    db.prepare('DELETE FROM workspace_shifts WHERE workspaceId = ?').run(workspaceId);
    const ins = db.prepare('INSERT INTO workspace_shifts (workspaceId, date, personId, level, lockState) VALUES (?, ?, ?, ?, NULL)');
    for (const s of items) ins.run(workspaceId, s.date, s.personId, s.level);
  });
  tx(shifts);
}

export function getWorkspaceCumulative(db: Database, workspaceId: string): Record<string, WorkspaceCumulativePerson> {
  const rows = db
    .prepare('SELECT personId, name, tagIds, monthsJson FROM workspace_cumulative WHERE workspaceId = ?')
    .all(workspaceId) as any[];
  const out: Record<string, WorkspaceCumulativePerson> = {};
  for (const row of rows) {
    out[row.personId] = {
      name: row.name || row.personId,
      tagIds: safeParseStringArray(row.tagIds),
      months: safeParseMonthsObject(row.monthsJson),
    };
  }
  return out;
}

export function saveWorkspaceCumulative(
  db: Database,
  workspaceId: string,
  data: Record<string, WorkspaceCumulativePerson>
): Record<string, WorkspaceCumulativePerson> {
  const now = Date.now();
  const tx = db.transaction((payload: Record<string, WorkspaceCumulativePerson>) => {
    db.prepare('DELETE FROM workspace_cumulative WHERE workspaceId = ?').run(workspaceId);
    const ins = db.prepare(`
      INSERT INTO workspace_cumulative (workspaceId, personId, name, tagIds, monthsJson, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [personId, person] of Object.entries(payload)) {
      ins.run(
        workspaceId,
        personId,
        person.name || personId,
        JSON.stringify(Array.isArray(person.tagIds) ? person.tagIds : []),
        JSON.stringify(person.months || {}),
        now
      );
    }
  });
  tx(data || {});
  return getWorkspaceCumulative(db, workspaceId);
}

export function logSolverRun(db: Database, payload: {
  workspaceId: string;
  periodKey: string;
  inputHash: string;
  cost: number | null;
  stats: unknown;
  violations: unknown;
}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO solver_runs (id, workspaceId, periodKey, inputHash, cost, statsJson, violationsJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.workspaceId,
    payload.periodKey,
    payload.inputHash,
    payload.cost,
    JSON.stringify(payload.stats ?? {}),
    JSON.stringify(payload.violations ?? []),
    Date.now()
  );
}

export function getWorkspaceConstraints(db: Database, workspaceId: string): WorkspaceConstraint[] {
  return db
    .prepare('SELECT id, name, targetTagId, condition, value FROM workspace_constraints WHERE workspaceId = ? ORDER BY name ASC')
    .all(workspaceId) as WorkspaceConstraint[];
}

export function saveWorkspaceConstraints(db: Database, workspaceId: string, constraints: WorkspaceConstraint[]) {
  const now = Date.now();
  const tx = db.transaction((items: WorkspaceConstraint[]) => {
    db.prepare('DELETE FROM workspace_constraints WHERE workspaceId = ?').run(workspaceId);
    const ins = db.prepare(`
      INSERT INTO workspace_constraints (workspaceId, id, name, targetTagId, condition, value, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      ins.run(
        workspaceId,
        item.id,
        item.name,
        item.targetTagId ?? null,
        item.condition ?? null,
        item.value ?? null,
        now
      );
    }
  });
  tx(constraints || []);
}
