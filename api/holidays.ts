import { json } from './_helpers';

export default async function handler(_req: any, res: any) {
  try {
    const response = await fetch('https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics');
    if (!response.ok) throw new Error('Failed to fetch holidays');
    const icsData = await response.text();
    const holidays: Array<{ date: string; name: string }> = [];
    const lines = icsData.split(/\r?\n/);
    let currentEvent: any = null;

    for (const line of lines) {
      if (line.startsWith('BEGIN:VEVENT')) currentEvent = {};
      else if (line.startsWith('END:VEVENT')) {
        if (currentEvent?.date && currentEvent?.name) holidays.push(currentEvent);
        currentEvent = null;
      } else if (currentEvent) {
        if (line.startsWith('DTSTART;VALUE=DATE:')) {
          const dateStr = line.substring('DTSTART;VALUE=DATE:'.length);
          if (dateStr.length === 8) currentEvent.date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        } else if (line.startsWith('SUMMARY:')) {
          currentEvent.name = line.substring('SUMMARY:'.length);
        }
      }
    }

    return json(res, 200, { ok: true, data: { holidays } });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: error?.message || 'Failed to fetch holidays' } });
  }
}
