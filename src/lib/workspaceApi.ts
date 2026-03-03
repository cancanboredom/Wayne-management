const STORAGE_KEY = 'wayne_workspace_id';
const AUTH_TOKEN_KEY = 'wayne_auth_token_v1';
export const PREVIEW_READONLY_CODE = 'PREVIEW_READONLY';
export const PREVIEW_READONLY_MESSAGE = 'Preview mode: ดูได้อย่างเดียว';

export class PreviewReadonlyError extends Error {
  readonly code = PREVIEW_READONLY_CODE;
  constructor(message = PREVIEW_READONLY_MESSAGE) {
    super(message);
    this.name = 'PreviewReadonlyError';
  }
}

export function getWorkspaceId(): string {
  if (typeof window === 'undefined') return 'default';
  return localStorage.getItem(STORAGE_KEY) || 'default';
}

export function setWorkspaceId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id || 'default');
}

export function withWorkspace(path: string): string {
  if (!path.startsWith('/api/')) return path;
  const id = getWorkspaceId();
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}workspaceId=${encodeURIComponent(id)}`;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const workspaceId = getWorkspaceId();
  const headers = new Headers(init?.headers || {});
  if (!headers.has('x-workspace-id')) headers.set('x-workspace-id', workspaceId);
  const authToken = typeof window === 'undefined' ? '' : (localStorage.getItem(AUTH_TOKEN_KEY) || '');
  if (authToken && !headers.has('authorization')) headers.set('authorization', `Bearer ${authToken}`);
  const response = await fetch(withWorkspace(input), {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response;

  let parsed: any = null;
  try {
    parsed = await response.clone().json();
  } catch {
    return response;
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    return response;
  }

  if (parsed.ok) {
    const normalized = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
    return new Response(JSON.stringify(normalized), {
      status: response.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const errObj = parsed.error && typeof parsed.error === 'object'
    ? parsed.error
    : { message: 'Request failed' };
  const normalizedError = {
    error: typeof errObj.message === 'string' ? errObj.message : 'Request failed',
    code: typeof errObj.code === 'string' ? errObj.code : undefined,
    details: errObj.details,
  };
  return new Response(JSON.stringify(normalizedError), {
    status: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function ensureApiSuccess(response: Response): Promise<Response> {
  if (response.ok) return response;
  let payload: any = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }
  if (payload?.code === PREVIEW_READONLY_CODE) {
    throw new PreviewReadonlyError();
  }
  const details = Array.isArray(payload?.details) ? payload.details : [];
  const detailText = details.length > 0 ? ` ${String(details[0])}` : '';
  throw new Error((payload?.error || `Request failed with status ${response.status}`) + detailText);
}

export function isPreviewReadonlyError(error: unknown): error is PreviewReadonlyError {
  return (
    error instanceof PreviewReadonlyError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === PREVIEW_READONLY_CODE)
  );
}
