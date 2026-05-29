import { formatDateKey, zonedDateKeyFromInstant } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import {
  addDaysToZonedYmd,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

export const DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE = 'America/Chicago';

function resolveExplicitIsoDayOffset(transcript: string, referenceNow: Date, timeZone: string) {
  const isoDateMatch = transcript.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);

  if (!isoDateMatch) {
    return null;
  }

  const explicitKey = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  const anchorYmd = getZonedYmd(referenceNow, timeZone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = addDaysToZonedYmd(anchorYmd, offset);

    if (formatDateKey(candidate) === explicitKey) {
      return offset;
    }
  }

  return null;
}

export function resolveTargetDayContext(
  transcript: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): CalendarDayContext {
  const naturalDay = parseNaturalDayOffset(transcript, referenceNow, timeZone);
  const explicitOffset = resolveExplicitIsoDayOffset(transcript, referenceNow, timeZone);

  const dayOffset = naturalDay?.dayOffset ?? explicitOffset ?? 0;
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);

  return {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };
}

export function resolveTargetDayContextForInstant(
  instantIso: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): CalendarDayContext | null {
  const dateKey = zonedDateKeyFromInstant(instantIso, timeZone);

  if (!dateKey) {
    return null;
  }

  const anchorYmd = getZonedYmd(referenceNow, timeZone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = addDaysToZonedYmd(anchorYmd, offset);

    if (formatDateKey(candidate) === dateKey) {
      const range = getZonedDayRange(referenceNow, offset, timeZone);

      return {
        dateKey,
        dayOffset: offset,
        range,
        timezone: timeZone,
      };
    }
  }

  return null;
}
