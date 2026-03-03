import { issueSession, json } from '../_helpers';
import { getWorkspacePasscodeHash } from '../../server/db/workspaceStateStore';
import { verifyPasscode } from '../../server/auth/session';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const workspaceId = String(req.body?.workspaceId || req.headers?.['x-workspace-id'] || 'default');
    const passcode = String(req.body?.passcode || '');

    const storedHash = await getWorkspacePasscodeHash(workspaceId);
    const valid = verifyPasscode(passcode, storedHash);
    if (!valid) {
      return json(res, 401, { ok: false, error: { code: 'INVALID_PASSCODE', message: 'Invalid passcode' } });
    }
    return issueSession(res, workspaceId);
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Unlock failed' } });
  }
}
