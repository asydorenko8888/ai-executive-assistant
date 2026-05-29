import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

function extractClockFragment(transcript: string) {
  const patterns = [
    /\b(?:в|на)\s+(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью)?)/iu,
    /\b(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью))/iu,
    /\b(?:at|@|о|в|на)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
    /\b(?:на|в)\s+(\d{1,2}(?::\d{2})?)\b/i,
    /\b(\d{1,2}:\d{2})\b/,
    /\b(\d{1,2})\s*(am|pm)\b/i,
    /\b(\d{1,2})\s*(?:pm|am)\b/i,
    /\b(?:о|в)\s+(\d{1,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match) {
      return (match[1] ?? match[0]).trim();
    }
  }

  return null;
}

export function parseQueryClockMinutes(transcript: string, day: CalendarDayContext): number | null {
  const fragment = extractClockFragment(transcript);

  if (!fragment) {
    return null;
  }

  const anchor = new Date(day.range.rangeStartMs + 12 * 60 * 60 * 1000);
  const parsed = parseSpokenClockTime(fragment, anchor, { rollToNextDayIfPast: false });

  if (!parsed) {
    return null;
  }

  const parts = getZonedTimeParts(parsed, day.timezone);

  return parts.hour * 60 + parts.minute;
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
