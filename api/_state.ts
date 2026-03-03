import { getWorkspaceId, json } from './_helpers';
import { getWorkspaceState, saveWorkspaceState } from '../server/db/workspaceStateStore';

export async function readState(req: any) {
  const workspaceId = getWorkspaceId(req);
  const state = await getWorkspaceState(workspaceId);
  return { workspaceId, state };
}

export async function writeState(workspaceId: string, state: any) {
  await saveWorkspaceState(workspaceId, state);
}

export function methodNotAllowed(res: any) {
  return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
}
