import { getWorkspaceId } from '../../lib/workspaceApi';
import type { ApiEnvelope } from './types';

const TOKEN_KEY = 'wayne_auth_token_v1';

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init?.headers || {});
  const workspaceId = getWorkspaceId();
  const token = getAuthToken();

  if (!headers.has('x-workspace-id')) headers.set('x-workspace-id', workspaceId);
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');

  const res = await fetch(path, { ...init, headers });
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!payload) {
    return {
      ok: res.ok,
      error: res.ok ? undefined : { message: `Request failed (${res.status})` },
      meta: { status: res.status },
    };
  }

  if (!res.ok && payload.ok) {
    return { ...payload, ok: false, meta: { ...(payload.meta || {}), status: res.status } };
  }

  return payload;
}
