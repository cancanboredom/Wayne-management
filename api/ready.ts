import { json } from './_helpers';

export default function handler(_req: any, res: any) {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((key) => !process.env[key]);
  return json(res, missing.length > 0 ? 503 : 200, {
    ok: missing.length === 0,
    data: { ready: missing.length === 0 },
    error: missing.length > 0 ? { code: 'MISSING_ENV', message: `Missing env: ${missing.join(', ')}` } : undefined,
  });
}
