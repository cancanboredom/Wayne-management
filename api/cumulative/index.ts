import { json } from '../_helpers';
import { readState } from '../_state';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  try {
    const { state } = await readState(req);
    return json(res, 200, { ok: true, data: { data: state.cumulative || {}, source: 'supabase-state', updatedAt: Date.now() } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to load cumulative data' } });
  }
}
