import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventsFromBackend,
  type GoogleCalendarBackendEvent,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  getEventStartTimestamp,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import {
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  resolveZonedDayOffsetForInstant,
  type ZonedDayRange,
} from '@/src/features/agent/calendar/calendarTimezone';
import {
  classifyCalendarAgendaQueryIntent,
  isCalendarListQuestion,
} from '@/src/features/voice/speech/voiceSpeechFormatter';
import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';

const FULL_AGENDA_REQUEST_PATTERNS = [
  /\bfull\s+list\b/i,
  /\ball\s+tasks?\b/i,
  /\bplans?\s+for\s+(?:today|tomorrow)\b/i,
  /\b(?:today|tomorrow)(?:'s)?\s+plans?\b/i,
  /\bagenda\b/i,
];

const TONIGHT_AGENDA_PATTERNS = [
  /\btonight\b/i,
  /\b(?:what|what's|whats).{0,24}tonight/i,
  /\bчто.{0,24}(?:сегодня\s+)?вечером/i,
  /\bщо.{0,24}(?:сьогодні\s+)?вечор/i,
];

const TOMORROW_AGENDA_PATTERNS = [
  /\b(?:завтра|tomorrow)\b/i,
  /\bзадач[аи]?\s+на\s+завтра/i,
  /\bчто\s+завтра/i,
  /\bщо\s+завтра/i,
  /\bwhat.{0,24}tomorrow/i,
  /\b(?:какие|які).{0,20}задач[аи]?\s+завтра/i,
  /\bчто\s+у\s+меня\s+завтра/i,
  /\bщо\s+у\s+мене\s+завтра/i,
];

const TODAY_AGENDA_PATTERNS = [
  /\b(?:сьогодні|сегодня|today)\b/i,
  /\bзадач[аи]?\s+на\s+сегодня/i,
  /\bзадач[аи]?\s+на\s+сьогодні/i,
];

export function isCalendarAgendaQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    Boolean(classifyCalendarAgendaQueryIntent(normalized)) ||
    isCalendarListQuestion(normalized) ||
    FULL_AGENDA_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    TONIGHT_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    TOMORROW_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    TODAY_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(?:какие|які|what|which|сколько|скільки).{0,32}(?:задач|tasks?|events?|meetings?|зустріч)/i.test(
      normalized,
    )
  );
}

export function resolveAgendaQueryDayOffset(
  transcript: string,
  referenceNow = new Date(),
  timeZone = getExecutiveCalendarTimezone(),
): number | null {
  const normalized = transcript.trim();
  const naturalDay = parseNaturalDayOffset(normalized, referenceNow, timeZone);

  if (naturalDay) {
    return naturalDay.dayOffset;
  }

  if (TOMORROW_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 1;
  }

  if (TODAY_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 0;
  }

  return null;
}

function mapBackendEvent(event: GoogleCalendarBackendEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.summary.trim() || 'Untitled event',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    isAllDay: !event.startsAt.includes('T'),
    attendees: [],
  };
}

export function filterEventsByZonedStartRange(
  events: CalendarEvent[],
  range: Pick<ZonedDayRange, 'rangeStartMs' | 'rangeEndMs'>,
) {
  return sortEventsChronologically(
    events.filter((event) => {
      const startTimestamp = getEventStartTimestamp(event);

      return (
        startTimestamp !== null &&
        startTimestamp >= range.rangeStartMs &&
        startTimestamp < range.rangeEndMs
      );
    }),
  );
}

function logCalendarQueryRange(range: ZonedDayRange) {
  console.log('[Calendar Query]', {
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    timezone: range.timezone,
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    dayOffset: range.dayOffset,
  });
}

function logCalendarQueryReturned(events: CalendarEvent[], timezone: string) {
  console.log(
    '[Calendar Query] returned events',
    events.map((event) => ({
      title: event.title,
      start: event.startsAt,
      startLocal: formatTimeInExecutiveTimezone(event.startsAt, timezone),
    })),
  );
}

export function logCalendarAnswerEvents(events: CalendarEvent[], timezone: string) {
  console.log(
    '[Calendar Answer] final filtered events',
    events.map((event) => ({
      title: event.title,
      start: event.startsAt,
      startLocal: formatTimeInExecutiveTimezone(event.startsAt, timezone),
    })),
  );
}

export async function fetchCalendarEventsForZonedDay(
  referenceNow: Date,
  dayOffset: number,
): Promise<{ events: CalendarEvent[]; range: ZonedDayRange; fetchOk: boolean }> {
  const timezone = getExecutiveCalendarTimezone();
  const range = getZonedDayRange(referenceNow, dayOffset, timezone);

  logCalendarQueryRange(range);

  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
  }).catch((error) => {
    console.log('[Calendar Query] fetch failed', {
      dayOffset,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!listed) {
    return { events: [], range, fetchOk: false };
  }

  const mapped = (listed.events ?? []).map(mapBackendEvent);
  const events = filterEventsByZonedStartRange(mapped, range);

  logCalendarQueryReturned(events, timezone);

  return { events, range, fetchOk: true };
}

export async function fetchCalendarEventsForAgendaQuery(params: {
  referenceNow: Date;
  userTranscript: string;
}): Promise<CalendarEvent[]> {
  const timezone = getExecutiveCalendarTimezone();
  const dayOffset = resolveAgendaQueryDayOffset(
    params.userTranscript,
    params.referenceNow,
    timezone,
  );

  if (dayOffset !== null) {
    const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, dayOffset);
    logCalendarAnswerEvents(events, getExecutiveCalendarTimezone());
    return events;
  }

  const [today, tomorrow] = await Promise.all([
    fetchCalendarEventsForZonedDay(params.referenceNow, 0),
    fetchCalendarEventsForZonedDay(params.referenceNow, 1),
  ]);

  const events = sortEventsChronologically([...today.events, ...tomorrow.events]);
  logCalendarAnswerEvents(events, getExecutiveCalendarTimezone());

  return events;
}

export async function fetchCalendarEventsForMutationDay(params: {
  referenceNow: Date;
  eventStartIso: string;
}): Promise<CalendarEvent[]> {
  const timezone = getExecutiveCalendarTimezone();
  const dayOffset = resolveZonedDayOffsetForInstant(
    params.eventStartIso,
    params.referenceNow,
    timezone,
  );

  if (dayOffset === null) {
    const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, 0);
    logCalendarAnswerEvents(events, timezone);
    return events;
  }

  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, dayOffset);
  logCalendarAnswerEvents(events, timezone);
  return events;
}

export function mergeLiveEventsReplacingZonedDay(
  currentEvents: CalendarEvent[],
  freshDayEvents: CalendarEvent[],
  range: Pick<ZonedDayRange, 'rangeStartMs' | 'rangeEndMs'>,
) {
  const kept = currentEvents.filter((event) => {
    const startTimestamp = getEventStartTimestamp(event);

    return (
      startTimestamp === null ||
      startTimestamp < range.rangeStartMs ||
      startTimestamp >= range.rangeEndMs
    );
  });

  return sortEventsChronologically([...kept, ...freshDayEvents]);
}
