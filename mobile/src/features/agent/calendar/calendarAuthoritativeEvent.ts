import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  formatCalendarClock24ForUi,
  formatCalendarDayPhrase,
} from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import type { GoogleCalendarBackendEvent } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export function isReadableVerifiedCalendarEvent(
  event: Pick<VerifiedCalendarEvent, 'id' | 'startsAt' | 'endsAt'> | null | undefined,
) {
  if (!event?.id?.trim()) {
    return false;
  }

  const startMs = parseGoogleCalendarInstant(event.startsAt);
  const endMs = parseGoogleCalendarInstant(event.endsAt);

  return startMs !== null && endMs !== null && !Number.isNaN(startMs) && !Number.isNaN(endMs);
}

export function mapGoogleBackendEventToVerified(event: GoogleCalendarBackendEvent): VerifiedCalendarEvent {
  return {
    id: event.id,
    summary: event.summary.trim() || 'Untitled event',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    htmlLink: event.htmlLink,
  };
}

export function formatVerifiedEventScheduleRangeForUi(params: {
  event: Pick<VerifiedCalendarEvent, 'startsAt' | 'endsAt'>;
  referenceNow?: Date;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const referenceMs = (params.referenceNow ?? new Date()).getTime();
  const startMs = parseGoogleCalendarInstant(params.event.startsAt);
  const endMs = parseGoogleCalendarInstant(params.event.endsAt);

  if (startMs === null || endMs === null) {
    return null;
  }

  const dayLabel = formatCalendarDayPhrase(startMs, referenceMs, params.locale, timeZone);
  const startClock = formatCalendarClock24ForUi(startMs, timeZone);
  const endClock = formatCalendarClock24ForUi(endMs, timeZone);

  return `${dayLabel}, ${startClock}–${endClock}`;
}

export function formatVerifiedEventStartLabelForUi(params: {
  event: Pick<VerifiedCalendarEvent, 'startsAt'>;
  referenceNow?: Date;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const referenceMs = (params.referenceNow ?? new Date()).getTime();
  const startMs = parseGoogleCalendarInstant(params.event.startsAt);

  if (startMs === null) {
    return null;
  }

  const dayLabel = formatCalendarDayPhrase(startMs, referenceMs, params.locale, timeZone);
  const startClock = formatCalendarClock24ForUi(startMs, timeZone);

  return `${dayLabel}, ${startClock}`;
}
