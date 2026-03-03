import { apiRequest, setAuthToken } from './http';
import type { ApiEnvelope, SessionInfo } from './types';

export type { ApiEnvelope, SessionInfo };
export { setAuthToken };

export function unlockWorkspace(workspaceId: string, passcode: string) {
  return apiRequest<SessionInfo>('/api/auth/unlock', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, passcode }),
  });
}

export async function getSession(): Promise<ApiEnvelope<SessionInfo>> {
  return apiRequest<SessionInfo>('/api/auth/session');
}

export async function logout() {
  const res = await apiRequest<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' });
  setAuthToken('');
  return res;
}

export async function enqueueSolverJob(payload: Record<string, unknown>) {
  return apiRequest<{ jobId: string; status: string }>('/api/solver/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSolverJob(jobId: string) {
  return apiRequest<{ jobId: string; status: string; result?: unknown; error?: string }>(`/api/solver/jobs/${jobId}`);
}

export async function cancelSolverJob(jobId: string) {
  return apiRequest<{ jobId: string; status: string }>(`/api/solver/jobs/${jobId}/cancel`, { method: 'POST' });
}
