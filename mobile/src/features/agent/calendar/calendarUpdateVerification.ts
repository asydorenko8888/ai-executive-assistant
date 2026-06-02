import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

const MATCH_TOLERANCE_MS = 60_000;

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseWallClock(dateTime: string): WallClockParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dateTime.trim());

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

function getZonedParts(instant: Date, timeZone: string): WallClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value),
    second: Number(parts.find((part) => part.type === 'second')?.value),
  };
}

function wallClockToUtcMs(parts: WallClockParts, timeZone: string): number | null {
  if (
    !Number.isFinite(parts.year) ||
    !Number.isFinite(parts.month) ||
    !Number.isFinite(parts.day) ||
    !Number.isFinite(parts.hour)
  ) {
    return null;
  }

  let utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = getZonedParts(new Date(utcGuess), timeZone);
    const desiredAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const actualAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const delta = desiredAsUtc - actualAsUtc;

    if (delta === 0) {
      return utcGuess;
    }

    utcGuess += delta;
  }

  return utcGuess;
}

function payloadInstant(dateTime: string, timeZone: string): number | null {
  const wallClock = parseWallClock(dateTime);

  if (!wallClock) {
    return null;
  }

  return wallClockToUtcMs(wallClock, timeZone);
}

function instantsMatch(left: number | null, right: number | null) {
  if (left === null || right === null || Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }

  return Math.abs(left - right) <= MATCH_TOLERANCE_MS;
}

export function verifyUpdatedEventMatchesPayload(
  event: VerifiedCalendarEvent,
  payload: CalendarUpdateEventPayload,
  options?: { requestedEventId?: string; originalStartsAt?: string },
) {
  const expectedStart = payloadInstant(payload.start.dateTime, payload.start.timeZone);
  const expectedEnd = payloadInstant(payload.end.dateTime, payload.end.timeZone);
  const actualStart = parseGoogleCalendarInstant(event.startsAt);
  const actualEnd = parseGoogleCalendarInstant(event.endsAt);
  const originalStart = options?.originalStartsAt
    ? parseGoogleCalendarInstant(options.originalStartsAt)
    : null;

  const startMatches = instantsMatch(expectedStart, actualStart);
  const endMatches = instantsMatch(expectedEnd, actualEnd);
  const eventIdMatches = options?.requestedEventId
    ? event.id === options.requestedEventId
    : true;
  const startChanged =
    originalStart === null || actualStart === null
      ? true
      : !instantsMatch(originalStart, actualStart);

  const ok = startMatches && endMatches && eventIdMatches && startChanged;

  return {
    ok,
    expectedStart,
    expectedEnd,
    actualStart,
    actualEnd,
    startMatches,
    endMatches,
    eventIdMatches,
    startChanged,
  };
}
