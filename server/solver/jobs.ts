import { randomUUID } from 'node:crypto';
import { selectMany, selectOne, supabaseEnabled, upsertRows } from '../db/supabaseRest';

export type SolverJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface SolverJobRecord {
  id: string;
  workspaceId: string;
  status: SolverJobStatus;
  payload: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface SolverJobRow {
  id: string;
  workspace_id: string;
  status: SolverJobStatus;
  payload: Record<string, unknown>;
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
}

const jobs = new Map<string, SolverJobRecord>();

function nowIso() {
  return new Date().toISOString();
}

function rowToRecord(row: SolverJobRow): SolverJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    payload: row.payload || {},
    result: row.result,
    error: row.error,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function enqueueSolverJob(workspaceId: string, payload: Record<string, unknown>): Promise<SolverJobRecord> {
  const id = randomUUID();
  const now = Date.now();
  const record: SolverJobRecord = { id, workspaceId, status: 'queued', payload, createdAt: now, updatedAt: now };

  if (!supabaseEnabled()) {
    jobs.set(id, record);
    return record;
  }

  await upsertRows('solver_jobs', [{ id, workspace_id: workspaceId, status: 'queued', payload, created_at: nowIso(), updated_at: nowIso() }], 'id');
  return record;
}

export async function getSolverJob(id: string): Promise<SolverJobRecord | null> {
  if (!supabaseEnabled()) return jobs.get(id) || null;
  const row = await selectOne<SolverJobRow>('solver_jobs', `select=id,workspace_id,status,payload,result,error,created_at,updated_at&id=eq.${encodeURIComponent(id)}`);
  return row ? rowToRecord(row) : null;
}

export async function cancelSolverJob(id: string): Promise<SolverJobRecord | null> {
  const current = await getSolverJob(id);
  if (!current) return null;
  if (current.status === 'succeeded' || current.status === 'failed') return current;
  return updateSolverJob(id, { status: 'canceled' });
}

export async function updateSolverJob(id: string, patch: Partial<Pick<SolverJobRecord, 'status' | 'result' | 'error'>>): Promise<SolverJobRecord | null> {
  const current = await getSolverJob(id);
  if (!current) return null;
  const next: SolverJobRecord = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };

  if (!supabaseEnabled()) {
    jobs.set(id, next);
    return next;
  }

  await upsertRows('solver_jobs', [{
    id: next.id,
    workspace_id: next.workspaceId,
    status: next.status,
    payload: next.payload,
    result: next.result,
    error: next.error,
    created_at: new Date(next.createdAt).toISOString(),
    updated_at: new Date(next.updatedAt).toISOString(),
  }], 'id');
  return next;
}

export async function claimNextQueuedJob(): Promise<SolverJobRecord | null> {
  if (!supabaseEnabled()) {
    const found = Array.from(jobs.values()).find((j) => j.status === 'queued');
    if (!found) return null;
    return updateSolverJob(found.id, { status: 'running' });
  }

  const queued = await selectMany<SolverJobRow>('solver_jobs', 'select=id,workspace_id,status,payload,result,error,created_at,updated_at&status=eq.queued&order=created_at.asc&limit=1');
  if (!queued[0]) return null;
  const claimed = await updateSolverJob(queued[0].id, { status: 'running' });
  return claimed;
}
