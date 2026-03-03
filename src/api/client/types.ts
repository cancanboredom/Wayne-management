export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

export interface SessionInfo {
  token: string;
  workspaceId: string;
  expiresAt: number;
}
