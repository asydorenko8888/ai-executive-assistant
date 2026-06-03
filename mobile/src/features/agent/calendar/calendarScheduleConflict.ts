import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventsFromBackend,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { findConflictingTimedEvents, scheduleIntervalsOverlap } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import {
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  resolveZonedDayOffsetForInstant,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

import { CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS } from '@/src/features/agent/calendar/calendarConflictRefreshPolicy';

const CONFLICT_REFRESH_BACKOFF_MS = [400, 800, 1600];

export type { CalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
export {
  findConflictingTimedEvents,
  resolveScheduleConflictIgnoreEventId,
  scheduleIntervalsOverlap,
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function logCalendarConflictRefreshFailure(params: {
  attempt: number;
  dayOffset: number;
  message?: string;
}) {
  console.log('[Calendar Conflict Refresh]', {
    attempt: params.attempt,
    dayOffset: params.dayOffset,
    message: params.message ?? 'fetch_failed',
    at: new Date().toISOString(),
  });
}

async function fetchTimedEventsNearScheduleWindowOnce(params: {
  referenceNow: Date;
  proposedStartMs: number;
  proposedEndMs: number;
  attempt: number;
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

  for (const dayOffset of dayOffsets) {
    const range = getZonedDayRange(params.referenceNow, dayOffset, timezone);
    const listed = await fetchGoogleCalendarEventsFromBackend({
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    }).catch((error) => {
      logCalendarConflictRefreshFailure({
        attempt: params.attempt,
        dayOffset,
        message: error instanceof Error ? error.message : 'fetch_failed',
      });
      return null;
    });

    if (!listed) {
      return { events: [], fetchOk: false };
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
        scheduleIntervalsOverlap(params.proposedStartMs, params.proposedEndMs, startMs, endMs)
      ) {
        collected.set(event.id, event);
      }
    }
  }

  return {
    events: [...collected.values()],
    fetchOk: true,
  };
}

export async function fetchTimedEventsNearScheduleWindow(params: {
  referenceNow: Date;
  proposedStartMs: number;
  proposedEndMs: number;
}): Promise<{ events: CalendarEvent[]; fetchOk: boolean; refreshAttempts: number }> {
  let lastResult: { events: CalendarEvent[]; fetchOk: boolean } = { events: [], fetchOk: false };

  for (let attempt = 0; attempt < CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    lastResult = await fetchTimedEventsNearScheduleWindowOnce({
      ...params,
      attempt: attempt + 1,
    });

    if (lastResult.fetchOk) {
      return {
        ...lastResult,
        refreshAttempts: attempt + 1,
      };
    }

    const hasMoreAttempts = attempt + 1 < CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS;

    if (hasMoreAttempts) {
      await sleep(CONFLICT_REFRESH_BACKOFF_MS[attempt] ?? CONFLICT_REFRESH_BACKOFF_MS.at(-1) ?? 800);
    }
  }

  console.log('[Calendar Conflict Refresh]', {
    exhausted: true,
    attempts: CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS,
    at: new Date().toISOString(),
  });

  return {
    events: [],
    fetchOk: false,
    refreshAttempts: CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS,
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

  const { events, fetchOk, refreshAttempts } = await fetchTimedEventsNearScheduleWindow({
    referenceNow: params.referenceNow,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });

  if (!fetchOk) {
    return { status: 'fetch_failed' as const, refreshAttempts };
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
