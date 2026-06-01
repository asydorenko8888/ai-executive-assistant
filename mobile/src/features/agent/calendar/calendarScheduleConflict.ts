import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventsFromBackend,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { findConflictingTimedEvents } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import {
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  resolveZonedDayOffsetForInstant,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

export type { CalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
export {
  findConflictingTimedEvents,
  scheduleWindowsOverlap,
} from '@/src/features/agent/calendar/calendarScheduleConflictCore';

function isTimedEventForConflictCheck(event: CalendarEvent) {
  if (event.isAllDay) {
    return false;
  }

  const startsAt = parseGoogleCalendarInstant(event.startsAt);
  const endsAt = parseGoogleCalendarInstant(event.endsAt);

  return startsAt !== null && endsAt !== null && endsAt > startsAt;
}

export async function fetchTimedEventsNearScheduleWindow(params: {
  referenceNow: Date;
  proposedStartMs: number;
  proposedEndMs: number;
}): Promise<{ events: CalendarEvent[]; fetchOk: boolean }> {
  const timezone = getExecutiveCalendarTimezone();
  const startOffset =
    resolveZonedDayOffsetForInstant(
      new Date(params.proposedStartMs).toISOString(),
      params.referenceNow,
      timezone,
    ) ?? 0;
  const endOffset =
    resolveZonedDayOffsetForInstant(
      new Date(params.proposedEndMs).toISOString(),
      params.referenceNow,
      timezone,
    ) ?? startOffset;

  const dayOffsets: number[] = [];

  for (let offset = Math.min(startOffset, endOffset) - 1; offset <= Math.max(startOffset, endOffset) + 1; offset += 1) {
    if (offset >= -1 && offset <= 14 && !dayOffsets.includes(offset)) {
      dayOffsets.push(offset);
    }
  }

  if (dayOffsets.length === 0) {
    dayOffsets.push(0);
  }

  const collected = new Map<string, CalendarEvent>();
  let fetchOk = true;

  for (const dayOffset of dayOffsets) {
    const range = getZonedDayRange(params.referenceNow, dayOffset, timezone);
    const listed = await fetchGoogleCalendarEventsFromBackend({
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    }).catch(() => null);

    if (!listed) {
      fetchOk = false;
      continue;
    }

    for (const raw of listed.events ?? []) {
      const event: CalendarEvent = {
        id: raw.id,
        title: raw.summary.trim() || 'Untitled event',
        startsAt: raw.startsAt,
        endsAt: raw.endsAt,
        location: raw.location,
        isAllDay: !raw.startsAt.includes('T'),
        attendees: [],
      };

      if (!isTimedEventForConflictCheck(event)) {
        continue;
      }

      const startMs = parseGoogleCalendarInstant(event.startsAt)!;
      const endMs = parseGoogleCalendarInstant(event.endsAt)!;

      if (
        params.proposedStartMs < endMs &&
        startMs < params.proposedEndMs
      ) {
        collected.set(event.id, event);
      }
    }
  }

  return {
    events: [...collected.values()],
    fetchOk,
  };
}

export async function checkCalendarScheduleConflict(params: {
  referenceNow: Date;
  proposedStartMs: number;
  proposedEndMs: number;
  ignoreEventId?: string | null;
  skipCheck?: boolean;
}) {
  if (params.skipCheck) {
    return { status: 'clear' as const };
  }

  if (Number.isNaN(params.proposedStartMs) || Number.isNaN(params.proposedEndMs)) {
    return {
      status: 'error' as const,
      reason: 'invalid_window' as const,
    };
  }

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow: params.referenceNow,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });

  if (!fetchOk) {
    return { status: 'fetch_failed' as const };
  }

  const conflicts = findConflictingTimedEvents({
    events,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    ignoreEventId: params.ignoreEventId,
  });

  if (conflicts.length === 0) {
    return { status: 'clear' as const };
  }

  return {
    status: 'conflict' as const,
    conflicts,
  };
}
