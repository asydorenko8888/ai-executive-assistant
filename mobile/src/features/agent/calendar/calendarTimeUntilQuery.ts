import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  calendarEventFromMemoryRecord,
  getActiveCalendarEvent,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import { deduplicateCalendarEvents } from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  isIgnorableTitleQueryForMemory,
  transcriptHasEventPronounReference,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { sortEventsChronologically } from '@/src/features/agent/calendar/calendarSchedule';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { normalizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitleNormalization';
import { scoreTitleMatchForMutation } from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import {
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
} from '@/src/features/agent/calendar/calendarSchedule';

const TIME_UNTIL_PATTERNS: Array<{ pattern: RegExp; group: number }> = [
  {
    pattern:
      /(?:сколько|скільки)\s+(?:у\s+меня\s+|у\s+мене\s+)?(?:времени|время|часу|час|осталось|залишилось)\s+до\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:сколько|скільки)\s+осталось\s+до\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:через\s+сколько|за\s+скільки)\s+(.+)/iu,
    group: 1,
  },
  {
    pattern:
      /(?:how\s+long\s+until|how\s+long\s+till|how\s+much\s+time\s+until|how\s+much\s+time\s+(?:is\s+)?left\s+until|time\s+until)\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:сколько|скільки)\s+до\s+(.+)/iu,
    group: 1,
  },
];

export function isCalendarTimeUntilEventQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return TIME_UNTIL_PATTERNS.some(({ pattern }) => pattern.test(normalized));
}

export function extractTimeUntilEventTitleQuery(transcript: string) {
  const normalized = transcript.trim();

  for (const { pattern, group } of TIME_UNTIL_PATTERNS) {
    const match = normalized.match(pattern);

    if (!match?.[group]) {
      continue;
    }

    const raw = match[group]
      .trim()
      .replace(/[?.!,;:]+$/u, '')
      .trim();

    if (!raw) {
      continue;
    }

    return normalizeCalendarEventTitle(raw);
  }

  return null;
}

function isEligibleTimeUntilEvent(event: CalendarEvent) {
  return !isCancelledCalendarEvent(event) && isTimedCalendarEvent(event);
}

function eventTitleMatchesTimeUntilQuery(titleQuery: string, event: CalendarEvent) {
  return scoreTitleMatchForMutation(titleQuery, event.title).tier !== 'none';
}

export function findAllTitleMatchingTimeUntilEvents(params: {
  titleQuery: string;
  events: CalendarEvent[];
}) {
  return sortEventsChronologically(params.events).filter(
    (event) =>
      isEligibleTimeUntilEvent(event) &&
      eventTitleMatchesTimeUntilQuery(params.titleQuery, event),
  );
}

export function findFutureMatchingTimeUntilEvents(params: {
  titleQuery: string;
  events: CalendarEvent[];
  referenceNow: Date;
}) {
  const nowTimestamp = params.referenceNow.getTime();

  return findAllTitleMatchingTimeUntilEvents(params)
    .filter((event) => {
      const startMs = parseGoogleCalendarInstant(event.startsAt);

      return startMs !== null && startMs > nowTimestamp;
    })
    .sort((left, right) => {
      const leftStart = parseGoogleCalendarInstant(left.startsAt) ?? Number.MAX_SAFE_INTEGER;
      const rightStart = parseGoogleCalendarInstant(right.startsAt) ?? Number.MAX_SAFE_INTEGER;

      return leftStart - rightStart;
    });
}

export function logTimeUntilEventSelection(params: {
  titleQuery: string;
  referenceNow: Date;
  selectedEvent: CalendarEvent | null;
  futureMatches: CalendarEvent[];
}) {
  const nowTimestamp = params.referenceNow.getTime();
  const selectedStartMs = params.selectedEvent
    ? parseGoogleCalendarInstant(params.selectedEvent.startsAt)
    : null;
  const diffMinutes =
    selectedStartMs === null
      ? null
      : Math.floor((selectedStartMs - nowTimestamp) / 60000);

  console.log('[calendar_time_until_select]', {
    titleQuery: params.titleQuery,
    currentTime: params.referenceNow.toISOString(),
    futureMatchCount: params.futureMatches.length,
    selectedEventId: params.selectedEvent?.id ?? null,
    selectedEventTitle: params.selectedEvent?.title ?? null,
    selectedEventStart: params.selectedEvent?.startsAt ?? null,
    diffMinutes,
    futureMatches: params.futureMatches.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      diffMinutes: (() => {
        const startMs = parseGoogleCalendarInstant(event.startsAt);

        return startMs === null ? null : Math.floor((startMs - nowTimestamp) / 60000);
      })(),
    })),
  });
}

export function getTimeUntilNoFutureMatchMessage(locale: 'ru' | 'uk' | 'en') {
  if (locale === 'uk') {
    return 'Немає майбутніх подій з такою назвою.';
  }

  if (locale === 'ru') {
    return 'Нет будущих событий с таким названием.';
  }

  return 'No upcoming events with that name.';
}

function resolveActiveEventForTimeUntil(params: {
  events: CalendarEvent[];
  referenceNow: Date;
}): CalendarEvent | null {
  const active = getActiveCalendarEvent(params.referenceNow);

  if (!active) {
    return null;
  }

  const dedupedEvents = deduplicateCalendarEvents(params.events);
  const byId = dedupedEvents.find((event) => event.id === active.eventId);

  if (byId && isEligibleTimeUntilEvent(byId)) {
    const startMs = parseGoogleCalendarInstant(byId.startsAt);

    if (startMs !== null && startMs > params.referenceNow.getTime()) {
      return byId;
    }
  }

  const fromMemory = calendarEventFromMemoryRecord(active);

  if (!isEligibleTimeUntilEvent(fromMemory)) {
    return null;
  }

  const startMs = parseGoogleCalendarInstant(fromMemory.startsAt);

  if (startMs === null || startMs <= params.referenceNow.getTime()) {
    return null;
  }

  return fromMemory;
}

export function resolveTimeUntilTargetEvent(params: {
  transcript: string;
  events: CalendarEvent[];
  referenceNow: Date;
}): CalendarEvent | null {
  const dedupedEvents = deduplicateCalendarEvents(params.events);
  const titleQuery = extractTimeUntilEventTitleQuery(params.transcript);
  const usesActiveEvent =
    !titleQuery ||
    isIgnorableTitleQueryForMemory(titleQuery) ||
    transcriptHasEventPronounReference(params.transcript);

  if (usesActiveEvent) {
    const selected = resolveActiveEventForTimeUntil({
      events: dedupedEvents,
      referenceNow: params.referenceNow,
    });

    logTimeUntilEventSelection({
      titleQuery: titleQuery ?? 'active_event',
      referenceNow: params.referenceNow,
      selectedEvent: selected,
      futureMatches: selected ? [selected] : [],
    });

    return selected;
  }

  const futureMatching = findFutureMatchingTimeUntilEvents({
    titleQuery,
    events: dedupedEvents,
    referenceNow: params.referenceNow,
  });

  const selected = futureMatching[0] ?? null;

  logTimeUntilEventSelection({
    titleQuery,
    referenceNow: params.referenceNow,
    selectedEvent: selected,
    futureMatches: futureMatching,
  });

  return selected;
}
