import { GoogleGenAI } from '@google/genai';
import { json } from './_helpers';
import { getSmartImportUsage } from './usage';
import { incrementUsage } from '../server/db/usageStore';

const LIMIT = 250;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });

  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      return json(res, 400, {
        ok: false,
        error: {
          message: 'Gemini API key not configured. Smart Import requires a free API key.',
          details: { helpUrl: 'https://aistudio.google.com/apikey' },
        },
      });
    }

    const currentCount = await getSmartImportUsage();
    if (currentCount >= LIMIT) {
      return json(res, 429, { ok: false, error: { message: `Daily free tier limit reached (${currentCount}/${LIMIT}). Resets tomorrow.` } });
    }

    const { base64Data, mimeType, currentDateStr, people } = req.body || {};
    const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `
Analyze this schedule image.
The current month is ${currentDateStr}.
Here is the list of available personnel: ${JSON.stringify(people)}.
Extract the shifts and return a JSON array of objects with this exact structure:
[
  { "date": "YYYY-MM-DD", "personId": "matched_id_from_list", "level": "1A" | "1B" | "2" | "3" }
]
CRITICAL INSTRUCTION: ONLY return shifts for slots that ACTUALLY HAVE A NAME written in them in the image.
Only return the JSON array. Do not include markdown formatting.
`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ inlineData: { data: base64Data, mimeType } }, { text: prompt }] },
    });

    let extractedText = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if ((part as any).text) extractedText += (part as any).text;
    }

    let shifts: any[] = [];
    try {
      const text = extractedText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
      shifts = JSON.parse(text || '[]');
    } catch {
      return json(res, 500, { ok: false, error: { message: 'Failed to parse schedule data from image.' } });
    }

    const used = await incrementUsage('smart-import');
    const pct = Math.round((used / LIMIT) * 100);
    return json(res, 200, {
      ok: true,
      data: {
        shifts,
        usage: {
          used,
          limit: LIMIT,
          percentage: pct,
          level: pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok',
        },
      },
    });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Internal server error during smart import.' } });
  }
}
