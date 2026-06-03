import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';
import { logCalendarQueryResolution } from '@/src/features/agent/calendar/calendarQueryDiagnostics';
import {
  extractCalendarClockFragment,
  parseCalendarClockMinutes,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';

export { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

export function parseQueryClockMinutes(
  transcript: string,
  day: CalendarDayContext,
  options?: { logResolution?: boolean },
): number | null {
  const minutes = parseCalendarClockMinutes(transcript, day);

  if (options?.logResolution !== false) {
    logCalendarQueryResolution({
      original_user_query: transcript.slice(0, 200),
      parsed_time_minutes: minutes,
      parsed_time_label: minutes === null ? null : formatWallClockLabel(minutes, day),
      timezone_used: day.timezone,
      events_found: [],
      calendar_refresh_status: 'skipped',
      calendarStore_count: 0,
      live_store_count: 0,
      remote_fetch_count: 0,
    });
  }

  return minutes;
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
