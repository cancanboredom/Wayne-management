import { json } from './_helpers';

export default function handler(_req: any, res: any) {
  const configured = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
  return json(res, 200, { ok: true, data: { configured } });
}
