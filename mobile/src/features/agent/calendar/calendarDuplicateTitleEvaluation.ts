import type { CalendarEvent } from '@/src/entities/calendar/types';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import {
  getExecutiveCalendarTimezone,
  resolveZonedDayOffsetForInstant,
} from '@/src/features/agent/calendar/calendarTimezone';

const START_TOLERANCE_MS = 60_000;

export type DuplicateTitleEvaluation = {
  shouldConfirm: boolean;
  exactDuplicate: boolean;
  existingEvent: CalendarEvent | null;
};

export function findSameTitleEventsOnDay(params: {
  events: CalendarEvent[];
  title: string;
  proposedStartMs: number;
  referenceNow: Date;
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const dayOffset = resolveZonedDayOffsetForInstant(
    new Date(params.proposedStartMs).toISOString(),
    params.referenceNow,
    timeZone,
  );

  if (dayOffset === null) {
    return [];
  }

  return params.events.filter((event) => {
    if (event.isAllDay) {
      return false;
    }

    if (!calendarConversationTitlesMatch(params.title, event.title)) {
      return false;
    }

    const eventDayOffset = resolveZonedDayOffsetForInstant(
      event.startsAt,
      params.referenceNow,
      timeZone,
    );

    return eventDayOffset === dayOffset;
  });
}

export function evaluateDuplicateTitleConfirmation(params: {
  events: CalendarEvent[];
  proposedTitle: string;
  proposedStartMs: number;
  referenceNow: Date;
  timeZone?: string;
}): DuplicateTitleEvaluation {
  const matches = findSameTitleEventsOnDay({
    events: params.events,
    title: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });

  if (matches.length === 0) {
    return {
      shouldConfirm: false,
      exactDuplicate: false,
      existingEvent: null,
    };
  }

  const exactMatch = matches.find((event) => {
    const startMs = Date.parse(event.startsAt);

    return !Number.isNaN(startMs) && Math.abs(startMs - params.proposedStartMs) < START_TOLERANCE_MS;
  });

  return {
    shouldConfirm: true,
    exactDuplicate: Boolean(exactMatch),
    existingEvent: exactMatch ?? matches[0] ?? null,
  };
}
