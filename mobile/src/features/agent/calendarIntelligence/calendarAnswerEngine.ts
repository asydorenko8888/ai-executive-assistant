import type { CalendarEvent } from '@/src/entities/calendar/types';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import {
  parseQueryClockMinutes,
  parseRequestedDurationMinutes,
} from '@/src/features/agent/calendarIntelligence/parseQueryClock';
import { logReadMatch } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import {
  classifyCalendarReadTimeKind,
  type CalendarReadTimeKind,
} from '@/src/features/agent/calendarIntelligence/calendarReadTimeIntent';
import {
  DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
  resolveTargetDayContext,
} from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  findBestSlot,
  findOverlappingEventPairs,
  getEventsActiveAtTime,
  getEventsForDay,
  getEventsStartingAtTime,
  getFreeWindows,
  getLastEvent,
  getNextEvent,
} from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import type { DeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/types';
import { recordSearchedConversationEvent } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { setLastCalendarReadMatch } from '@/src/features/agent/execution/calendarExecutionSession';

function resolveAtTimeEvents(params: {
  intent: 'events_at_time' | 'events_starting_at_time' | 'count_at_time';
  transcript: string;
  normalized: ReturnType<typeof normalizeCalendarEvents>;
  day: ReturnType<typeof resolveTargetDayContext>;
  clockMinutes: number;
}) {
  const readTimeKind: CalendarReadTimeKind =
    params.intent === 'events_starting_at_time'
      ? 'event_starting_at_time'
      : classifyCalendarReadTimeKind(params.transcript) ?? 'event_at_time';

  if (readTimeKind === 'event_starting_at_time') {
    return {
      readTimeKind,
      events: getEventsStartingAtTime(params.normalized, params.day, params.clockMinutes),
    };
  }

  return {
    readTimeKind,
    events: getEventsActiveAtTime(params.normalized, params.day, params.clockMinutes),
  };
}

export function buildDeterministicCalendarAnswer(params: {
  transcript: string;
  events: CalendarEvent[];
  referenceNow: Date;
  timeZone?: string;
}): DeterministicCalendarAnswer | null {
  const intent = classifyCalendarQueryIntent(params.transcript);

  if (!intent) {
    return null;
  }

  const day = resolveTargetDayContext(
    params.transcript,
    params.referenceNow,
    params.timeZone ?? DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
  );
  const scopedRaw = filterRawEventsForDay(params.events, day);
  const normalized = normalizeCalendarEvents(scopedRaw, day.timezone);
  const dayEvents = getEventsForDay(normalized, day);

  if (intent === 'list_day') {
    return { intent, day, events: dayEvents, payload: { count: dayEvents.length } };
  }

  if (
    intent === 'events_at_time' ||
    intent === 'events_starting_at_time' ||
    intent === 'count_at_time'
  ) {
    const clockMinutes = parseQueryClockMinutes(params.transcript, day);

    if (clockMinutes === null) {
      return null;
    }

    const { readTimeKind, events: atTimeEvents } = resolveAtTimeEvents({
      intent,
      transcript: params.transcript,
      normalized,
      day,
      clockMinutes,
    });

    const rawMatches = scopedRaw.filter((event) =>
      atTimeEvents.some((match) => match.id === event.id),
    );

    logReadMatch({
      transcript: params.transcript,
      readTimeKind,
      clockMinutes,
      matchedEvents: rawMatches,
      pinnedEventId: rawMatches.length === 1 ? rawMatches[0]?.id ?? null : null,
    });

    if (rawMatches.length === 1) {
      const only = rawMatches[0]!;

      setLastCalendarReadMatch({
        eventId: only.id,
        title: only.title,
        startISO: only.startsAt,
        clockMinutes,
        readTimeKind,
      });
      recordSearchedConversationEvent({
        eventId: only.id,
        title: only.title,
        startISO: only.startsAt,
        endISO: only.endsAt,
      });
    } else {
      setLastCalendarReadMatch(null);
    }

    return {
      intent,
      day,
      events: dayEvents,
      payload: { clockMinutes, atTimeEvents, count: atTimeEvents.length, readTimeKind },
    };
  }

  if (intent === 'next_event') {
    const nextEvent = getNextEvent(normalized, day, params.referenceNow);

    return { intent, day, events: dayEvents, payload: { nextEvent } };
  }

  if (intent === 'last_event') {
    const lastEvent = getLastEvent(normalized, day);

    return { intent, day, events: dayEvents, payload: { lastEvent } };
  }

  if (intent === 'overlaps') {
    const overlaps = findOverlappingEventPairs(dayEvents);

    return { intent, day, events: dayEvents, payload: { overlaps } };
  }

  if (intent === 'free_windows' || intent === 'best_slot' || intent === 'combine_activity') {
    const durationMinutes = parseRequestedDurationMinutes(params.transcript);
    const freeSlots = getFreeWindows(normalized, day, params.referenceNow, durationMinutes);
    const bestSlot = findBestSlot(normalized, day, params.referenceNow, durationMinutes);

    return {
      intent,
      day,
      events: dayEvents,
      payload: { durationMinutes, freeSlots, bestSlot },
    };
  }

  return null;
}
