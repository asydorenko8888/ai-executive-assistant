import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import {
  getZonedTimeParts,
  type ZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDateKey(ymd: ZonedYmd) {
  return `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`;
}

export function zonedMinutesFromInstant(iso: string, timeZone: string): number | null {
  const parsed = parseGoogleCalendarInstant(iso);

  if (parsed === null) {
    return null;
  }

  const parts = getZonedTimeParts(new Date(parsed), timeZone);

  return parts.hour * 60 + parts.minute;
}

export function zonedDateKeyFromInstant(iso: string, timeZone: string): string | null {
  const parsed = parseGoogleCalendarInstant(iso);

  if (parsed === null) {
    return null;
  }

  const parts = getZonedTimeParts(new Date(parsed), timeZone);

  return formatDateKey(parts);
}
