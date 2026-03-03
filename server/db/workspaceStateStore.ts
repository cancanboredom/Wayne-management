import { hashPasscode } from '../auth/session';
import { supabaseEnabled, selectMany, selectOne, upsertRows } from './supabaseRest';

export interface WorkspaceRecord {
  id: string;
  name: string;
  timezone: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceState {
  people: any[];
  shifts: any[];
  manualHighlights: string[];
  noonDays: string[];
  versions: any[];
  constraints: any[];
  cumulative: Record<string, any>;
  templates: any[];
  monthRosters: Record<string, any>;
  monthLocks: Record<string, any>;
  schedulingConfig: any;
  ruleset: any;
}

interface WorkspaceStateRow {
  workspace_id: string;
  state: WorkspaceState;
  updated_at?: string;
}

const memoryStates = new Map<string, WorkspaceState>();
const memoryWorkspaces = new Map<string, WorkspaceRecord>([['default', { id: 'default', name: 'Default Workspace', timezone: 'UTC' }]]);
const memoryAccess = new Map<string, string>([['default', hashPasscode('123456')]]);

export function emptyState(): WorkspaceState {
  return {
    people: [],
    shifts: [],
    manualHighlights: [],
    noonDays: [],
    versions: [],
    constraints: [],
    cumulative: {},
    templates: [],
    monthRosters: {},
    monthLocks: {},
    schedulingConfig: null,
    ruleset: null,
  };
}

export async function listWorkspacesStore(): Promise<WorkspaceRecord[]> {
  if (!supabaseEnabled()) return Array.from(memoryWorkspaces.values());
  const rows = await selectMany<WorkspaceRecord>('workspaces', 'select=id,name,timezone,created_at,updated_at&order=created_at.asc');
  if (rows.length === 0) return [{ id: 'default', name: 'Default Workspace', timezone: 'UTC' }];
  return rows;
}

export async function createWorkspaceStore(input: { id: string; name: string; timezone: string }): Promise<WorkspaceRecord> {
  const row: WorkspaceRecord = { id: input.id, name: input.name, timezone: input.timezone || 'UTC' };
  if (!supabaseEnabled()) {
    memoryWorkspaces.set(row.id, row);
    if (!memoryStates.has(row.id)) memoryStates.set(row.id, emptyState());
    if (!memoryAccess.has(row.id)) memoryAccess.set(row.id, hashPasscode('123456'));
    return row;
  }

  await upsertRows('workspaces', [row], 'id');
  await upsertRows('workspace_access', [{ workspace_id: row.id, passcode_hash: hashPasscode('123456'), policy: {} }], 'workspace_id');
  await upsertRows('workspace_state', [{ workspace_id: row.id, state: emptyState() }], 'workspace_id');
  return row;
}

export async function getWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
  if (!supabaseEnabled()) {
    if (!memoryStates.has(workspaceId)) memoryStates.set(workspaceId, emptyState());
    return memoryStates.get(workspaceId)!;
  }

  const row = await selectOne<WorkspaceStateRow>('workspace_state', `select=workspace_id,state,updated_at&workspace_id=eq.${encodeURIComponent(workspaceId)}`);
  if (!row?.state) {
    await upsertRows('workspaces', [{ id: workspaceId, name: workspaceId === 'default' ? 'Default Workspace' : workspaceId, timezone: 'UTC' }], 'id');
    await upsertRows('workspace_access', [{ workspace_id: workspaceId, passcode_hash: hashPasscode('123456'), policy: {} }], 'workspace_id');
    const state = emptyState();
    await upsertRows('workspace_state', [{ workspace_id: workspaceId, state }], 'workspace_id');
    return state;
  }
  return row.state;
}

export async function saveWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void> {
  if (!supabaseEnabled()) {
    memoryStates.set(workspaceId, state);
    return;
  }
  await upsertRows('workspace_state', [{ workspace_id: workspaceId, state }], 'workspace_id');
}

export async function getWorkspacePasscodeHash(workspaceId: string): Promise<string> {
  if (!supabaseEnabled()) {
    if (!memoryAccess.has(workspaceId)) memoryAccess.set(workspaceId, hashPasscode('123456'));
    return memoryAccess.get(workspaceId)!;
  }
  const row = await selectOne<{ workspace_id: string; passcode_hash: string }>('workspace_access', `select=workspace_id,passcode_hash&workspace_id=eq.${encodeURIComponent(workspaceId)}`);
  if (row?.passcode_hash) return row.passcode_hash;
  const fallback = hashPasscode('123456');
  await upsertRows('workspace_access', [{ workspace_id: workspaceId, passcode_hash: fallback, policy: {} }], 'workspace_id');
  return fallback;
}

export async function setWorkspacePasscodeHash(workspaceId: string, passcodeHash: string): Promise<void> {
  if (!supabaseEnabled()) {
    memoryAccess.set(workspaceId, passcodeHash);
    return;
  }
  await upsertRows('workspace_access', [{ workspace_id: workspaceId, passcode_hash: passcodeHash, policy: {} }], 'workspace_id');
}
