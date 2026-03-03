import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.SQLITE_PATH || 'wayne_duty.db';
const OUT = process.env.EXPORT_PATH || 'supabase/seed/sqlite-export.json';

function readJson(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function main() {
  const db = new Database(DB_PATH, { readonly: true });

  const payload = {
    exportedAt: new Date().toISOString(),
    people: db.prepare('SELECT * FROM people').all().map((row: any) => ({
      ...row,
      unavailableDates: readJson(row.unavailableDates),
      tagIds: readJson(row.tagIds),
    })),
    shifts: db.prepare('SELECT * FROM shifts').all(),
    versions: db.prepare('SELECT * FROM versions').all().map((row: any) => ({
      ...row,
      shifts: readJson(row.shifts),
    })),
    workspaces: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").all().length
      ? db.prepare('SELECT * FROM workspaces').all()
      : [{ id: 'default', name: 'Default Workspace', timezone: 'UTC' }],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`Exported SQLite snapshot to ${OUT}`);
}

main();
