import { json } from '../_helpers';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  return json(res, 200, { ok: true, data: { loggedOut: true } });
}
