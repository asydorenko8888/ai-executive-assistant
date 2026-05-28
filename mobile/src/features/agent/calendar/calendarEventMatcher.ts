import type { CalendarEvent } from '@/src/entities/calendar/types';
import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import { getCalendarAgendaWindow } from '@/src/features/agent/calendar/calendarTime';
import { fetchGoogleCalendarEventsFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  filterUpcomingTimedEvents,
  getEventStartTimestamp,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { parseOperationalScheduleHint } from '@/src/features/agent/execution/calendarEventPayloadBuilder';

const DELETE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]+|$)/iu;

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(value: string) {
  return normalizeMatchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function scoreTitleMatch(eventTitle: string, queryTitle: string) {
  const eventNorm = normalizeMatchText(eventTitle);
  const queryNorm = normalizeMatchText(queryTitle);

  if (!queryNorm) {
    return 0;
  }

  if (eventNorm === queryNorm) {
    return 100;
  }

  if (eventNorm.includes(queryNorm) || queryNorm.includes(eventNorm)) {
    return 80;
  }

  const queryTokens = tokenize(queryNorm);
  const eventTokens = new Set(tokenize(eventNorm));
  const overlap = queryTokens.filter((token) => eventTokens.has(token)).length;

  if (overlap === 0) {
    return 0;
  }

  return Math.round((overlap / queryTokens.length) * 70);
}

function scoreTimeMatch(event: CalendarEvent, targetMs: number | null) {
  if (targetMs === null) {
    return 0;
  }

  const start = getEventStartTimestamp(event);

  if (start === null) {
    return 0;
  }

  const deltaMinutes = Math.abs(start - targetMs) / 60_000;

  if (deltaMinutes <= 5) {
    return 40;
  }

  if (deltaMinutes <= 30) {
    return 25;
  }

  if (deltaMinutes <= 120) {
    return 10;
  }

  return 0;
}

export async function findCalendarEventForDelete(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const window = getCalendarAgendaWindow(params.referenceNow);
  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  });

  const events: CalendarEvent[] = sortEventsChronologically(
    listed.events.map((event) => ({
      id: event.id,
      title: event.summary,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      isAllDay: !event.startsAt.includes('T'),
      attendees: [],
    })),
  );

  const upcoming = filterUpcomingTimedEvents(events, params.referenceNow);
  const titleQuery = extractCalendarEventTitle(
    params.transcript.replace(DELETE_COMMAND_PREFIX, ''),
  );
  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);
  const targetMs = schedule.ok ? schedule.date.getTime() : null;

  const ranked = upcoming
    .map((event) => ({
      event,
      score: scoreTitleMatch(event.title, titleQuery) + scoreTimeMatch(event, targetMs),
    }))
    .filter((entry) => entry.score >= 40)
    .sort((left, right) => right.score - left.score);

  console.log('[Calendar Delete] match candidates', {
    titleQuery,
    targetMs,
    candidates: ranked.slice(0, 5).map((entry) => ({
      title: entry.event.title,
      startsAt: entry.event.startsAt,
      score: entry.score,
    })),
  });

  return {
    match: ranked[0]?.event ?? null,
    candidates: ranked.map((entry) => entry.event),
    titleQuery,
    targetMs,
  };
}
