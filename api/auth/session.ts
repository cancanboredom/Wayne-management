import { getBearerClaims, getWorkspaceId, json } from '../_helpers';

export default function handler(req: any, res: any) {
  const workspaceId = getWorkspaceId(req);
  const claims = getBearerClaims(req);
  if (!claims || claims.workspaceId !== workspaceId) {
    return json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Session missing or expired' } });
  }

  return json(res, 200, {
    ok: true,
    data: {
      token: '',
      workspaceId: claims.workspaceId,
      expiresAt: claims.exp,
    },
  });
}
