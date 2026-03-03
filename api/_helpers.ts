import { createSessionToken, parseBearerToken, verifyPasscode, verifySessionToken } from '../server/auth/session';

export function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function getWorkspaceId(req: any): string {
  const queryId = typeof req.query?.workspaceId === 'string' ? req.query.workspaceId : '';
  const headerId = typeof req.headers?.['x-workspace-id'] === 'string' ? req.headers['x-workspace-id'] : '';
  const bodyId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : '';
  return queryId || headerId || bodyId || 'default';
}

export function getBearerClaims(req: any) {
  const auth = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  return verifySessionToken(parseBearerToken(auth));
}

export function requireWorkspaceAccess(req: any, res: any): { workspaceId: string } | null {
  const workspaceId = getWorkspaceId(req);
  const claims = getBearerClaims(req);
  if (!claims || claims.workspaceId !== workspaceId) {
    json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing session' } });
    return null;
  }
  return { workspaceId };
}

export function issueSession(res: any, workspaceId: string) {
  const token = createSessionToken(workspaceId);
  const claims = verifySessionToken(token);
  json(res, 200, {
    ok: true,
    data: {
      token,
      workspaceId,
      expiresAt: claims?.exp || Date.now(),
    },
  });
}

export function validatePasscode(passcode: string, storedHash: string): boolean {
  return verifyPasscode(passcode, storedHash);
}
