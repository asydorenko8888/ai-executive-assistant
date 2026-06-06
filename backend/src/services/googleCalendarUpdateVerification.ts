export type UpdateGoogleCalendarEventBody = {
  summary?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type CreatedGoogleCalendarEvent = {
  id: string;
  summary: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  htmlLink?: string;
};

export const UPDATE_VERIFY_RETRY_DELAYS_MS = [0, 500, 1000, 2000];
export const UPDATE_VERIFY_TOLERANCE_MS = 60_000;

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

function parseGoogleInstant(isoValue: string): number | null {
  const trimmed = isoValue.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);

  return Number.isNaN(parsed) ? null : parsed;
}

function instantsMatch(left: number | null, right: number | null) {
  if (left === null || right === null || Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }

  return Math.abs(left - right) <= UPDATE_VERIFY_TOLERANCE_MS;
}

export function updateEventsRoughlyMatch(
  fetched: CreatedGoogleCalendarEvent,
  payload: UpdateGoogleCalendarEventBody,
) {
  const expectedStart = payloadInstant(payload.start.dateTime, payload.start.timeZone);
  const expectedEnd = payloadInstant(payload.end.dateTime, payload.end.timeZone);
  const actualStart = parseGoogleInstant(fetched.startsAt);
  const actualEnd = parseGoogleInstant(fetched.endsAt);

  return instantsMatch(expectedStart, actualStart) && instantsMatch(expectedEnd, actualEnd);
}

export type UpdateVerificationMismatch = {
  expectedStart: string;
  expectedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  expectedStartMs: number | null;
  expectedEndMs: number | null;
  actualStartMs: number | null;
  actualEndMs: number | null;
  startMatches: boolean;
  endMatches: boolean;
};

export function describeUpdateVerificationMismatch(
  fetched: CreatedGoogleCalendarEvent,
  payload: UpdateGoogleCalendarEventBody,
): UpdateVerificationMismatch {
  const expectedStartMs = payloadInstant(payload.start.dateTime, payload.start.timeZone);
  const expectedEndMs = payloadInstant(payload.end.dateTime, payload.end.timeZone);
  const actualStartMs = parseGoogleInstant(fetched.startsAt);
  const actualEndMs = parseGoogleInstant(fetched.endsAt);

  return {
    expectedStart: payload.start.dateTime,
    expectedEnd: payload.end.dateTime,
    actualStart: fetched.startsAt,
    actualEnd: fetched.endsAt,
    expectedStartMs,
    expectedEndMs,
    actualStartMs,
    actualEndMs,
    startMatches: instantsMatch(expectedStartMs, actualStartMs),
    endMatches: instantsMatch(expectedEndMs, actualEndMs),
  };
}

export type UpdateVerificationReadAttempt = {
  attemptIndex: number;
  delayMs: number;
  readable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  matchesPayload: boolean;
  mismatch: UpdateVerificationMismatch | null;
  fetchError: string | null;
};

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function verifyUpdatedEventWithRetries(params: {
  eventId: string;
  payload: UpdateGoogleCalendarEventBody;
  oldStartsAt?: string | null;
  oldEndsAt?: string | null;
  readEvent: () => Promise<CreatedGoogleCalendarEvent | null>;
  delaysMs?: number[];
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{
  verified: boolean;
  event: CreatedGoogleCalendarEvent | null;
  attempts: UpdateVerificationReadAttempt[];
  finalMismatch: UpdateVerificationMismatch | null;
}> {
  const delaysMs = params.delaysMs ?? UPDATE_VERIFY_RETRY_DELAYS_MS;
  const sleepFn = params.sleepFn ?? sleep;
  const attempts: UpdateVerificationReadAttempt[] = [];
  let finalMismatch: UpdateVerificationMismatch | null = null;

  console.log('[Calendar Update Verify Start]', {
    eventId: params.eventId,
    oldStartsAt: params.oldStartsAt ?? null,
    requestedStart: params.payload.start.dateTime,
    requestedEnd: params.payload.end.dateTime,
    retryDelaysMs: delaysMs,
  });

  for (let attemptIndex = 0; attemptIndex < delaysMs.length; attemptIndex += 1) {
    const delayMs = delaysMs[attemptIndex] ?? 0;

    if (delayMs > 0) {
      await sleepFn(delayMs);
    }

    let fetched: CreatedGoogleCalendarEvent | null = null;
    let fetchError: string | null = null;

    try {
      fetched = await params.readEvent();
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
    }

    const readable = Boolean(fetched?.startsAt && fetched.endsAt);
    const matchesPayload = readable && fetched ? updateEventsRoughlyMatch(fetched, params.payload) : false;
    const mismatch =
      readable && fetched && !matchesPayload
        ? describeUpdateVerificationMismatch(fetched, params.payload)
        : null;

    if (mismatch) {
      finalMismatch = mismatch;
    }

    const attempt: UpdateVerificationReadAttempt = {
      attemptIndex,
      delayMs,
      readable,
      startsAt: fetched?.startsAt ?? null,
      endsAt: fetched?.endsAt ?? null,
      matchesPayload,
      mismatch,
      fetchError,
    };

    attempts.push(attempt);

    const startMatches = mismatch?.startMatches ?? matchesPayload;
    const endMatches = mismatch?.endMatches ?? matchesPayload;
    const verificationResult = matchesPayload ? 'MATCH' : fetchError ? 'FETCH_ERROR' : 'MISMATCH';

    console.error('CALENDAR_VERIFY_ATTEMPT', {
      pid: process.pid,
      eventId: params.eventId,
      attemptIndex,
      delayMs,
      originalStart: params.oldStartsAt ?? null,
      originalEnd: params.oldEndsAt ?? null,
      requestedStart: params.payload.start.dateTime,
      requestedEnd: params.payload.end.dateTime,
      googleReturnedStart: attempt.startsAt,
      googleReturnedEnd: attempt.endsAt,
      startMatches,
      endMatches,
      verificationResult,
      fetchError,
      timestamp: new Date().toISOString(),
    });

    console.log('[Calendar Update Verify Fetch]', {
      eventId: params.eventId,
      attemptIndex,
      delayMs,
      readable,
      startsAt: attempt.startsAt,
      endsAt: attempt.endsAt,
      matchesPayload,
      fetchError,
      mismatch,
    });

    if (matchesPayload && fetched) {
      console.error('CALENDAR_VERIFY_RESULT', {
        pid: process.pid,
        eventId: params.eventId,
        ok: true,
        attemptIndex,
        delayMs,
        startsAt: fetched.startsAt,
        endsAt: fetched.endsAt,
        timestamp: new Date().toISOString(),
      });

      return {
        verified: true,
        event: fetched,
        attempts,
        finalMismatch: null,
      };
    }
  }

  console.error('CALENDAR_VERIFY_RESULT', {
    pid: process.pid,
    eventId: params.eventId,
    ok: false,
    attempts: attempts.length,
    finalMismatch,
    timestamp: new Date().toISOString(),
  });

  return {
    verified: false,
    event: null,
    attempts,
    finalMismatch,
  };
}
