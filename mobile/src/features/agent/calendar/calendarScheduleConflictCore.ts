import type { CalendarEvent } from '@/src/entities/calendar/types';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { isCancelledCalendarEvent } from '@/src/features/agent/calendar/calendarSchedule';

export type CalendarScheduleConflict = {
  event: CalendarEvent;
  startsAtMs: number;
  endsAtMs: number;
};

/** Interval overlap: newStart < existingEnd && newEnd > existingStart (instant ms, any timezone). */
export function scheduleIntervalsOverlap(
  newStartMs: number,
  newEndMs: number,
  existingStartMs: number,
  existingEndMs: number,
) {
  return newStartMs < existingEndMs && newEndMs > existingStartMs;
}

/** @deprecated Use scheduleIntervalsOverlap — kept for existing call sites. */
export function scheduleWindowsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return scheduleIntervalsOverlap(startA, endA, startB, endB);
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
      scheduleIntervalsOverlap(
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

/**
 * Events to skip when checking conflicts.
 * Create must never ignore conversation-memory events — only fresh Google list + explicit self id.
 */
export function resolveScheduleConflictIgnoreEventId(params: {
  operation: 'create' | 'update';
  updateEventId?: string | null;
  selfCreatedEventId?: string | null;
  currentOperationEventId?: string | null;
}): string | null {
  if (params.operation === 'create') {
    return params.selfCreatedEventId ?? null;
  }

  return (
    params.updateEventId ??
    params.selfCreatedEventId ??
    params.currentOperationEventId ??
    null
  );
}
