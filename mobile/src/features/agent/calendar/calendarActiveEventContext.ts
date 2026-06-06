import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ConversationEventRecord } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  toCurrentActiveCalendarEvent,
  type CalendarEventScheduleIdentity,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  getActiveCalendarEventRecord,
  getConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { isIgnorableTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { getExecutiveCalendarTimezone, resolveZonedDayOffsetForInstant } from '@/src/features/agent/calendar/calendarTimezone';
import type { CalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

/** Relative calendar words — destination day for search, not weekday names. */
const TEMPORAL_DESTINATION_IN_TRANSCRIPT =
  /\b(?:today|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра)\b/iu;

export function calendarEventFromMemoryRecord(record: ConversationEventRecord): CalendarEvent {
  return {
    id: record.eventId,
    title: record.title,
    startsAt: record.startISO,
    endsAt: record.endISO,
    isAllDay: false,
  };
}

export function getActiveCalendarEvent(referenceNow: Date) {
  return getActiveCalendarEventRecord(referenceNow);
}

/** Latest created, moved, updated, deleted or referenced event for pronoun resolution. */
export function getCurrentActiveCalendarEvent(
  referenceNow: Date,
): CalendarEventScheduleIdentity | null {
  const record = getActiveCalendarEventRecord(referenceNow);

  if (!record) {
    return null;
  }

  return toCurrentActiveCalendarEvent(
    {
      id: record.eventId,
      title: record.title,
      startsAt: record.startISO,
      endsAt: record.endISO,
    },
    record.dateKey,
  );
}

export function resolveMutationSearchDayOffset(params: {
  transcript: string;
  referenceNow: Date;
  memoryRef?: ConversationEventRecord | null;
  schedule?: CalendarUpdateSchedule;
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const memoryRef = params.memoryRef ?? getActiveCalendarEvent(params.referenceNow);

  if (memoryRef?.startISO) {
    const memoryDay = resolveZonedDayOffsetForInstant(memoryRef.startISO, params.referenceNow, timeZone);

    if (memoryDay !== null) {
      const schedule = params.schedule;
      const useMemoryDay =
        schedule?.ok &&
        (schedule.kind === 'day_preserve_time' || schedule.kind === 'relative_offset');

      if (useMemoryDay || !TEMPORAL_DESTINATION_IN_TRANSCRIPT.test(params.transcript)) {
        return memoryDay;
      }
    }
  }

  if (params.schedule?.ok) {
    if (
      params.schedule.kind === 'destination' ||
      params.schedule.kind === 'day_period'
    ) {
      return params.schedule.explicitDayOffset;
    }

    if (params.schedule.kind === 'day_preserve_time') {
      return params.schedule.explicitDayOffset;
    }
  }

  return resolveTargetDayContext(params.transcript, params.referenceNow, timeZone).dayOffset;
}

export function resolveActiveEventForMutation<T extends CalendarEvent>(params: {
  events: T[];
  referenceNow: Date;
  titleQuery?: string;
}): T | null {
  const ref = resolveMoveEventReference(params.referenceNow);

  if (!ref) {
    return null;
  }

  const titleQuery = params.titleQuery?.trim() ?? '';
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(titleQuery) ? '' : titleQuery;

  if (
    effectiveTitleQuery &&
    !calendarConversationTitlesMatch(effectiveTitleQuery, ref.title)
  ) {
    return null;
  }

  if (!ref.eventId.startsWith('pending:') && !ref.eventId.startsWith('pending-intent:')) {
    const byId = params.events.find((event) => event.id === ref.eventId);

    if (byId) {
      return byId;
    }

    return calendarEventFromMemoryRecord(ref) as T;
  }

  if (isIgnorableTitleQueryForMemory(effectiveTitleQuery)) {
    const lastReferenced = getConversationEventMemory().lastReferencedEvent;

    if (lastReferenced && !lastReferenced.eventId.startsWith('pending:')) {
      const byId = params.events.find((event) => event.id === lastReferenced.eventId);

      if (byId) {
        return byId;
      }

      return calendarEventFromMemoryRecord(lastReferenced) as T;
    }
  }

  return null;
}

export function shouldResolveMutationFromActiveMemory(params: {
  transcript: string;
  referenceNow: Date;
  titleQuery?: string;
  timeZone?: string;
  allowExplicitClock?: boolean;
}) {
  const memoryRef = resolveMoveEventReference(params.referenceNow);

  if (!memoryRef) {
    return false;
  }

  const titleQuery = params.titleQuery?.trim() ?? '';
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(titleQuery) ? '' : titleQuery;

  if (isIgnorableTitleQueryForMemory(titleQuery)) {
    return true;
  }

  if (
    effectiveTitleQuery &&
    !calendarConversationTitlesMatch(effectiveTitleQuery, memoryRef.title)
  ) {
    return false;
  }

  if (params.allowExplicitClock) {
    return true;
  }

  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);

  return parseCalendarClockMinutes(params.transcript, day) === null;
}
