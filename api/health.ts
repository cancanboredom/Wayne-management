import { json } from './_helpers';

export default function handler(_req: any, res: any) {
  return json(res, 200, { ok: true, data: { status: 'ok', service: 'wayne-api' } });
}
