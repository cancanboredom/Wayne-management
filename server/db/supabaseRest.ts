import { env } from '../core/env';

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY');

export function supabaseEnabled(): boolean {
  return !!SUPABASE_URL && !!SERVICE_KEY;
}

function buildUrl(path: string): string {
  return `${SUPABASE_URL}${path}`;
}

async function req<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(buildUrl(path), {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function selectOne<T>(table: string, query: string): Promise<T | null> {
  const rows = await req<T[]>(`/rest/v1/${table}?${query}`, { method: 'GET' });
  return rows[0] || null;
}

export async function selectMany<T>(table: string, query: string): Promise<T[]> {
  return req<T[]>(`/rest/v1/${table}?${query}`, { method: 'GET' });
}

export async function upsertRows<T>(table: string, rows: T[], onConflict: string): Promise<T[]> {
  return req<T[]>(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
}

export async function insertRows<T>(table: string, rows: T[]): Promise<T[]> {
  return req<T[]>(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
}

export async function deleteWhere(table: string, query: string): Promise<void> {
  await req(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}
