import { json } from './_helpers';
import { getUsage, todayStr } from '../server/db/usageStore';

const LIMIT = 250;

export async function getSmartImportUsage() {
  return getUsage('smart-import');
}

export default async function handler(_req: any, res: any) {
  const count = await getSmartImportUsage();
  const pct = Math.round((count / LIMIT) * 100);
  const level = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok';
  return json(res, 200, {
    ok: true,
    data: {
      date: todayStr(),
      usage: {
        'smart-import': {
          label: 'Gemini API (Smart Import)',
          used: count,
          limit: LIMIT,
          percentage: pct,
          level,
        },
      },
    },
  });
}
