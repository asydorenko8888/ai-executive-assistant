import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

export { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

export function parseQueryClockMinutes(transcript: string, day: CalendarDayContext): number | null {
  return parseCalendarClockMinutes(transcript, day);
}

export function parseRequestedDurationMinutes(transcript: string) {
  const normalized = transcript.toLowerCase();

  const hourMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:hours?|hour|годин|година|час|часа|часов)\b/i);

  if (hourMatch) {
    return Math.round(Number(hourMatch[1].replace(',', '.')) * 60);
  }

  const minuteMatch = normalized.match(/\b(\d+)\s*(?:min(?:ute)?s?|мин(?:ут)?)\b/i);

  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  if (/\b(?:hour|час|годин)\b/i.test(normalized)) {
    return 60;
  }

  if (/\b(?:half an hour|30 min|полчаса|30 мин)\b/i.test(normalized)) {
    return 30;
  }

  return 60;
}
