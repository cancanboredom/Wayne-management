import { json } from './_helpers';

export default function handler(_req: any, res: any) {
  const readonly = String(process.env.PREVIEW_READONLY || '').toLowerCase() === 'true';
  return json(res, 200, {
    ok: true,
    data: {
      readonly,
      message: 'Preview mode: ดูได้อย่างเดียว',
    },
  });
}
