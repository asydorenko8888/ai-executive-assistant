import {
  buildTokenDebugLog,
  CALENDAR_EVENTS_WRITE_SCOPE,
  getValidGoogleCalendarAccessToken,
  scopesIncludeCalendarEventsWrite,
  type StoredGoogleCalendarTokens,
} from './googleCalendarTokenStore.js';

import { fetchGoogleCalendarApiJson } from './googleCalendarApiClient.js';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export type CreateGoogleCalendarEventBody = {
  summary: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
};

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

type GoogleEventPayload = {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function logCalendarPipeline(stage: string, details: Record<string, unknown>) {
  console.log(`[GoogleCalendarWrite] ${stage}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function logCalendarPermissions(tokens: StoredGoogleCalendarTokens) {
  const debug = buildTokenDebugLog(tokens);

  logCalendarPipeline('calendar.permissions', {
    connectedEmail: debug.connectedEmail,
    refreshTokenPresent: debug.refreshTokenPresent,
    expiresAt: debug.expiresAt,
    accessToken: debug.accessToken,
  });

  logCalendarPipeline('calendar.scopes', {
    scopes: debug.scopes,
    requiredScope: CALENDAR_EVENTS_WRITE_SCOPE,
    hasCalendarEventsScope: debug.hasCalendarEventsScope,
    hasCalendarWriteScope: debug.hasCalendarWriteScope,
  });
}

function resolveGoogleCalendarOperation(label: string): 'read' | 'create' | 'update' | 'delete' {
  if (label.includes('insert')) {
    return 'create';
  }

  if (label.includes('patch') || label.includes('update')) {
    return 'update';
  }

  if (label.includes('delete')) {
    return 'delete';
  }

  return 'read';
}

async function fetchGoogleCalendarJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<
  | { ok: true; body: GoogleEventPayload; status: number }
  | { ok: false; timedOut: boolean; status?: number; message: string; rawBody?: unknown }
> {
  const operation = resolveGoogleCalendarOperation(label);
  const result = await fetchGoogleCalendarApiJson<GoogleEventPayload>({
    url,
    init,
    label,
    operation,
  });

  logCalendarPipeline('api_response', {
    label,
    httpStatus: result.ok ? result.status : result.status ?? null,
    ok: result.ok,
    attempts: result.attempts,
    authFailure: result.ok ? false : result.authFailure,
  });

  if (result.ok) {
    return { ok: true, body: result.body, status: result.status };
  }

  return {
    ok: false,
    timedOut: result.timedOut,
    status: result.status,
    message: result.message,
    rawBody: result.rawBody,
  };
}

function normalizeEvent(body: GoogleEventPayload, fallback: CreateGoogleCalendarEventBody): CreatedGoogleCalendarEvent | null {
  const id = body.id?.trim();
  const startsAt = body.start?.dateTime ?? body.start?.date;
  const endsAt = body.end?.dateTime ?? body.end?.date;

  if (!id || !startsAt || !endsAt || body.status === 'cancelled') {
    return null;
  }

  return {
    id,
    summary: body.summary?.trim() || fallback.summary,
    location: body.location?.trim() || fallback.location,
    startsAt,
    endsAt,
    htmlLink: body.htmlLink?.trim() || undefined,
  };
}

function isReadableCalendarEvent(event: CreatedGoogleCalendarEvent | null | undefined) {
  if (!event?.id?.trim() || !event.startsAt?.trim() || !event.endsAt?.trim()) {
    return false;
  }

  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);

  return !Number.isNaN(startMs) && !Number.isNaN(endMs);
}

function eventsRoughlyMatch(
  inserted: CreatedGoogleCalendarEvent,
  fetched: CreatedGoogleCalendarEvent,
  payload: CreateGoogleCalendarEventBody,
) {
  const summaryMatches =
    fetched.summary.toLowerCase() === inserted.summary.toLowerCase() ||
    fetched.summary.toLowerCase() === payload.summary.toLowerCase();

  const startMatches =
    fetched.startsAt.slice(0, 16) === inserted.startsAt.slice(0, 16) ||
    fetched.startsAt.slice(0, 16) === payload.start.dateTime.slice(0, 16);

  return summaryMatches && startMatches;
}

async function getGoogleCalendarEventById(
  tokens: StoredGoogleCalendarTokens,
  eventId: string,
  fallback: CreateGoogleCalendarEventBody,
) {
  return fetchGoogleCalendarJson(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    },
    'events.get',
  ).then((result) => {
    if (!result.ok) {
      return { ok: false as const, message: result.message, timedOut: result.timedOut };
    }

    const event = normalizeEvent(result.body, fallback);

    if (!event) {
      return { ok: false as const, message: 'events.get returned invalid event' };
    }

    return { ok: true as const, event };
  });
}

async function listEventsContainingSummary(
  tokens: StoredGoogleCalendarTokens,
  payload: CreateGoogleCalendarEventBody,
  eventId: string,
) {
  const startMs = Date.parse(payload.start.dateTime);
  const timeMin = new Date(startMs - 5 * 60_000).toISOString();
  const timeMax = new Date(startMs + 2 * 60 * 60_000).toISOString();
  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=20`;

  const result = await fetchGoogleCalendarJson(
    url,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    },
    'events.list',
  );

  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  const listPayload = result.body as unknown as { items?: GoogleEventPayload[] };
  const items = listPayload.items ?? [];
  const found = items.find((item) => item.id === eventId || item.summary === payload.summary);

  logCalendarPipeline('verification_query', {
    listedCount: items.length,
    found: Boolean(found),
    eventId,
    summary: payload.summary,
  });

  if (!found) {
    return { ok: false as const, message: 'Event not found in events.list' };
  }

  const event = normalizeEvent(found, payload);

  if (!event) {
    return { ok: false as const, message: 'Listed event failed normalization' };
  }

  return { ok: true as const, event };
}

function buildTestEventPayload(timeZone: string): CreateGoogleCalendarEventBody {
  const start = new Date(Date.now() + 10 * 60_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');

  const dateTime = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  return {
    summary: 'TEST EVENT',
    start: { dateTime: dateTime(start), timeZone },
    end: { dateTime: dateTime(end), timeZone },
  };
}

export async function createGoogleCalendarEventForDevice(
  deviceId: string,
  payload: CreateGoogleCalendarEventBody,
) {
  logCalendarPipeline('insert_request', {
    deviceId: deviceId.slice(0, 8),
    payload,
  });

  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected on the server.',
    };
  }

  logCalendarPermissions(tokens);

  if (!scopesIncludeCalendarEventsWrite(tokens.scopes)) {
    logCalendarPipeline('WRITE_SCOPE_MISSING', {
      scopes: tokens.scopes,
      required: CALENDAR_EVENTS_WRITE_SCOPE,
    });

    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'WRITE_SCOPE_MISSING',
      errorMessage: `Missing required scope: ${CALENDAR_EVENTS_WRITE_SCOPE}`,
    };
  }

  logCalendarPipeline('insert_payload', { payload });

  const insertResult = await fetchGoogleCalendarJson(
    GOOGLE_CALENDAR_EVENTS_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: payload.summary,
        location: payload.location,
        start: payload.start,
        end: payload.end,
        recurrence: payload.recurrence,
      }),
    },
    'events.insert',
  );

  if (!insertResult.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: insertResult.timedOut
        ? 'calendar_confirmation_timeout'
        : insertResult.status === 403
          ? 'WRITE_SCOPE_MISSING'
          : 'calendar_api_unavailable',
      errorMessage: insertResult.message,
      httpStatus: insertResult.status,
      apiResponse: insertResult.rawBody,
    };
  }

  const inserted = normalizeEvent(insertResult.body, payload);

  if (!inserted) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_insert_failed',
      errorMessage: 'Insert response could not be parsed.',
      apiResponse: insertResult.body,
    };
  }

  logCalendarPipeline('insert_success', {
    eventId: inserted.id,
    summary: inserted.summary,
    startsAt: inserted.startsAt,
  });

  const getResult = await getGoogleCalendarEventById(tokens, inserted.id, payload);

  logCalendarPipeline('verification_get', {
    ok: getResult.ok,
    eventId: inserted.id,
  });

  let verifiedEvent = getResult.ok ? getResult.event : null;

  if (!verifiedEvent) {
    const listResult = await listEventsContainingSummary(tokens, payload, inserted.id);
    verifiedEvent = listResult.ok ? listResult.event : null;
  }

  if (!verifiedEvent || !isReadableCalendarEvent(verifiedEvent)) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'VERIFY_FAILED',
      errorMessage: 'Insert succeeded but verification failed.',
      insertedEventId: inserted.id,
    };
  }

  if (!eventsRoughlyMatch(inserted, verifiedEvent, payload)) {
    console.log('[Calendar Create Verified Mismatch]', {
      eventId: verifiedEvent.id,
      requestedStart: payload.start.dateTime,
      actualStart: verifiedEvent.startsAt,
      actualEnd: verifiedEvent.endsAt,
    });
  }

  logCalendarPipeline('verification_success', {
    eventId: verifiedEvent.id,
    summary: verifiedEvent.summary,
    startsAt: verifiedEvent.startsAt,
    endsAt: verifiedEvent.endsAt,
  });

  return {
    ok: true as const,
    executionState: 'success' as const,
    verified: true,
    verificationFetched: true,
    event: verifiedEvent,
  };
}

export async function runGoogleCalendarTestInsert(deviceId: string, timeZone = 'UTC') {
  const payload = buildTestEventPayload(timeZone);

  logCalendarPipeline('test_insert_start', { payload });

  return createGoogleCalendarEventForDevice(deviceId, payload);
}

const DELETE_FALLBACK: CreateGoogleCalendarEventBody = {
  summary: 'Deleted event',
  start: { dateTime: new Date().toISOString(), timeZone: 'UTC' },
  end: { dateTime: new Date().toISOString(), timeZone: 'UTC' },
};

export async function deleteGoogleCalendarEventForDevice(deviceId: string, eventId: string) {
  logCalendarPipeline('delete_request', {
    deviceId: deviceId.slice(0, 8),
    eventId,
  });

  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected on the server.',
    };
  }

  if (!scopesIncludeCalendarEventsWrite(tokens.scopes)) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'WRITE_SCOPE_MISSING',
      errorMessage: `Missing required scope: ${CALENDAR_EVENTS_WRITE_SCOPE}`,
    };
  }

  const existing = await getGoogleCalendarEventById(tokens, eventId, DELETE_FALLBACK);

  if (!existing.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'CALENDAR_EVENT_NOT_FOUND',
      errorMessage: existing.message,
    };
  }

  const deleteResult = await fetchGoogleCalendarJson(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    },
    'events.delete',
  );

  if (!deleteResult.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: deleteResult.status === 404 ? 'CALENDAR_EVENT_NOT_FOUND' : 'calendar_api_unavailable',
      errorMessage: deleteResult.message,
    };
  }

  const verifyGet = await getGoogleCalendarEventById(tokens, eventId, DELETE_FALLBACK);
  const deleted = !verifyGet.ok;

  logCalendarPipeline('delete_success', {
    eventId,
    summary: existing.event.summary,
    verified: deleted,
  });

  if (!deleted) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'VERIFY_FAILED',
      errorMessage: 'Google Calendar still returned the event after delete.',
    };
  }

  return {
    ok: true as const,
    executionState: 'success' as const,
    verified: true,
    verificationFetched: true,
    event: existing.event,
  };
}

function toCreateFallbackFromUpdate(payload: UpdateGoogleCalendarEventBody): CreateGoogleCalendarEventBody {
  return {
    summary: payload.summary ?? 'Updated event',
    location: payload.location,
    start: payload.start,
    end: payload.end,
  };
}

const UPDATE_VERIFY_TOLERANCE_MS = 60_000;

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

function updateEventsRoughlyMatch(fetched: CreatedGoogleCalendarEvent, payload: UpdateGoogleCalendarEventBody) {
  const expectedStart = payloadInstant(payload.start.dateTime, payload.start.timeZone);
  const expectedEnd = payloadInstant(payload.end.dateTime, payload.end.timeZone);
  const actualStart = parseGoogleInstant(fetched.startsAt);
  const actualEnd = parseGoogleInstant(fetched.endsAt);

  return instantsMatch(expectedStart, actualStart) && instantsMatch(expectedEnd, actualEnd);
}

export async function updateGoogleCalendarEventForDevice(
  deviceId: string,
  eventId: string,
  payload: UpdateGoogleCalendarEventBody,
) {
  const fallback = toCreateFallbackFromUpdate(payload);

  console.log('[Calendar Update Patch Request]', {
    deviceId: deviceId.slice(0, 8),
    eventId,
    payload,
  });

  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected on the server.',
    };
  }

  logCalendarPermissions(tokens);

  if (!scopesIncludeCalendarEventsWrite(tokens.scopes)) {
    logCalendarPipeline('WRITE_SCOPE_MISSING', {
      scopes: tokens.scopes,
      required: CALENDAR_EVENTS_WRITE_SCOPE,
    });

    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'WRITE_SCOPE_MISSING',
      errorMessage: `Missing required scope: ${CALENDAR_EVENTS_WRITE_SCOPE}`,
    };
  }

  const existing = await getGoogleCalendarEventById(tokens, eventId, fallback);

  if (!existing.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'CALENDAR_EVENT_NOT_FOUND',
      errorMessage: existing.message,
    };
  }

  logCalendarPipeline('patch_payload', { eventId, payload });

  const patchResult = await fetchGoogleCalendarJson(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: payload.summary,
        location: payload.location,
        start: payload.start,
        end: payload.end,
      }),
    },
    'events.patch',
  );

  if (!patchResult.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: patchResult.timedOut
        ? 'calendar_confirmation_timeout'
        : patchResult.status === 403
          ? 'WRITE_SCOPE_MISSING'
          : patchResult.status === 404
            ? 'CALENDAR_EVENT_NOT_FOUND'
            : 'calendar_api_unavailable',
      errorMessage: patchResult.message,
      httpStatus: patchResult.status,
      apiResponse: patchResult.rawBody,
    };
  }

  const patched = normalizeEvent(patchResult.body, fallback);

  if (!patched) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_patch_failed',
      errorMessage: 'Patch response could not be parsed.',
      apiResponse: patchResult.body,
    };
  }

  console.log('[Calendar Update Patch Response]', {
    eventId: patched.id,
    summary: patched.summary,
    startsAt: patched.startsAt,
    endsAt: patched.endsAt,
  });

  const getResult = await getGoogleCalendarEventById(tokens, eventId, fallback);

  console.log('[Calendar Update Verify Fetch]', {
    ok: getResult.ok,
    eventId,
    startsAt: getResult.event?.startsAt ?? null,
    endsAt: getResult.event?.endsAt ?? null,
  });

  if (!getResult.ok || !isReadableCalendarEvent(getResult.event)) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'VERIFY_FAILED',
      errorMessage: 'Patch succeeded but verification failed.',
      patchedEventId: patched.id,
    };
  }

  if (!updateEventsRoughlyMatch(getResult.event, payload)) {
    console.log('[Calendar Update Verified Mismatch]', {
      eventId,
      expectedStart: payload.start.dateTime,
      expectedEnd: payload.end.dateTime,
      actualStart: getResult.event.startsAt,
      actualEnd: getResult.event.endsAt,
    });
  }

  console.log('[Calendar Update Verified]', {
    eventId: getResult.event.id,
    summary: getResult.event.summary,
    startsAt: getResult.event.startsAt,
    endsAt: getResult.event.endsAt,
  });

  return {
    ok: true as const,
    executionState: 'success' as const,
    verified: true,
    verificationFetched: true,
    event: getResult.event,
  };
}
