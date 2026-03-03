import { selectOne, upsertRows, supabaseEnabled } from './supabaseRest';

const memoryUsage = new Map<string, number>();

function key(date: string, endpoint: string) {
  return `${date}:${endpoint}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function getUsage(endpoint: string, date = today()): Promise<number> {
  if (!supabaseEnabled()) return memoryUsage.get(key(date, endpoint)) || 0;
  const row = await selectOne<{ usage_date: string; endpoint: string; count: number }>('api_usage', `select=usage_date,endpoint,count&usage_date=eq.${encodeURIComponent(date)}&endpoint=eq.${encodeURIComponent(endpoint)}`);
  return Number(row?.count || 0);
}

export async function incrementUsage(endpoint: string, date = today()): Promise<number> {
  if (!supabaseEnabled()) {
    const k = key(date, endpoint);
    const next = (memoryUsage.get(k) || 0) + 1;
    memoryUsage.set(k, next);
    return next;
  }

  const current = await getUsage(endpoint, date);
  const next = current + 1;
  await upsertRows('api_usage', [{ usage_date: date, endpoint, count: next, updated_at: new Date().toISOString() }], 'usage_date,endpoint');
  return next;
}

export function todayStr() {
  return today();
}
