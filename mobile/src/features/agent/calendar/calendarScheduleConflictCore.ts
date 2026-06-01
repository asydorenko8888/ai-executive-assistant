import type { CalendarEvent } from '@/src/entities/calendar/types';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { isCancelledCalendarEvent } from '@/src/features/agent/calendar/calendarSchedule';

export type CalendarScheduleConflict = {
  event: CalendarEvent;
  startsAtMs: number;
  endsAtMs: number;
};

/** Half-open interval overlap: [start, end) */
export function scheduleWindowsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}

function isTimedEventForConflict(event: CalendarEvent) {
  if (event.isAllDay) {
    return false;
  }

  if (isCancelledCalendarEvent(event)) {
    return false;
  }

  const startsAt = parseGoogleCalendarInstant(event.startsAt);
  const endsAt = parseGoogleCalendarInstant(event.endsAt);

  return startsAt !== null && endsAt !== null && endsAt > startsAt;
}

export function findConflictingTimedEvents(params: {
  events: CalendarEvent[];
  proposedStartMs: number;
  proposedEndMs: number;
  ignoreEventId?: string | null;
}): CalendarScheduleConflict[] {
  const conflicts: CalendarScheduleConflict[] = [];

  for (const event of params.events) {
    if (params.ignoreEventId && event.id === params.ignoreEventId) {
      continue;
    }

    if (!isTimedEventForConflict(event)) {
      continue;
    }

    const startsAtMs = parseGoogleCalendarInstant(event.startsAt)!;
    const endsAtMs = parseGoogleCalendarInstant(event.endsAt)!;

    if (
      scheduleWindowsOverlap(
        params.proposedStartMs,
        params.proposedEndMs,
        startsAtMs,
        endsAtMs,
      )
    ) {
      conflicts.push({
        event,
        startsAtMs,
        endsAtMs,
      });
    }
  }

  return conflicts.sort((left, right) => left.startsAtMs - right.startsAtMs);
}
