import type { CalendarEvent } from '@/src/entities/calendar/types';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import {
  parseQueryClockMinutes,
  parseRequestedDurationMinutes,
} from '@/src/features/agent/calendarIntelligence/parseQueryClock';
import {
  DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
  resolveTargetDayContext,
} from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  findBestSlot,
  findOverlappingEventPairs,
  getEventsAtTime,
  getEventsForDay,
  getFreeWindows,
  getLastEvent,
  getNextEvent,
} from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import type { DeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/types';

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

  if (intent === 'events_at_time' || intent === 'count_at_time') {
    const clockMinutes = parseQueryClockMinutes(params.transcript, day);

    if (clockMinutes === null) {
      return null;
    }

    const atTimeEvents = getEventsAtTime(normalized, day, clockMinutes);

    return {
      intent,
      day,
      events: dayEvents,
      payload: { clockMinutes, atTimeEvents, count: atTimeEvents.length },
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
