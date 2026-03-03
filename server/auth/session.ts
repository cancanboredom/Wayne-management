import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../core/env';

const SESSION_SECRET = env('SESSION_SECRET', 'dev-session-secret-change-me');
const TOKEN_TTL_MS = Number(env('SESSION_TTL_MS', String(12 * 60 * 60 * 1000)));

export interface SessionClaims {
  workspaceId: string;
  exp: number;
  iat: number;
}

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function createSessionToken(workspaceId: string): string {
  const now = Date.now();
  const claims: SessionClaims = {
    workspaceId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const payload = toBase64Url(JSON.stringify(claims));
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  try {
    const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return null;
  } catch {
    return null;
  }

  try {
    const claims = JSON.parse(fromBase64Url(payload)) as SessionClaims;
    if (!claims.workspaceId || !claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(passcode, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasscode(passcode: string, encoded: string): boolean {
  const [salt, expectedHash] = (encoded || '').split(':');
  if (!salt || !expectedHash) return false;
  const candidate = pbkdf2Sync(passcode, salt, 120000, 32, 'sha256').toString('hex');
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

export function parseBearerToken(headerValue: string | undefined): string {
  if (!headerValue) return '';
  const [kind, token] = headerValue.split(' ');
  if (kind?.toLowerCase() !== 'bearer') return '';
  return token || '';
}
