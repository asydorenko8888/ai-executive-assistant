import {
  buildTokenDebugLog,
  CALENDAR_EVENTS_WRITE_SCOPE,
  getValidGoogleCalendarAccessToken,
  scopesIncludeCalendarEventsWrite,
  type StoredGoogleCalendarTokens,
} from './googleCalendarTokenStore.js';

import { fetchGoogleCalendarApiJson } from './googleCalendarApiClient.js';
import {
  attachGoogleCalendarEventReminders,
  logCalendarEventReminderSet,
} from './googleCalendarEventReminders.js';
import {
  verifyUpdatedEventWithRetries,
} from './googleCalendarUpdateVerification.js';

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
      body: JSON.stringify(
        attachGoogleCalendarEventReminders({
          summary: payload.summary,
          location: payload.location,
          start: payload.start,
          end: payload.end,
          recurrence: payload.recurrence,
        }),
      ),
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

  const calendarId = 'primary';
  const deleteUrl = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`;

  console.log('[delete_event_request]', {
    calendarId,
    eventId,
  });

  const deleteResult = await fetchGoogleCalendarJson(
    deleteUrl,
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

  const deleteHttpOk = deleteResult.status === 204 || deleteResult.status === 200;

  if (!deleteHttpOk) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'calendar_api_unavailable',
      errorMessage: `Unexpected delete HTTP status: ${deleteResult.status}`,
    };
  }

  const verifyGet = await getGoogleCalendarEventById(tokens, eventId, DELETE_FALLBACK);
  const deleted = !verifyGet.ok;

  logCalendarPipeline('delete_success', {
    eventId,
    summary: existing.event.summary,
    verified: deleted,
    deleteHttpStatus: deleteResult.status,
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

export async function updateGoogleCalendarEventForDevice(
  deviceId: string,
  eventId: string,
  payload: UpdateGoogleCalendarEventBody,
) {
  const fallback = toCreateFallbackFromUpdate(payload);

  console.log('[Calendar Update Patch Request]', {
    deviceId: deviceId.slice(0, 8),
    eventId,
    requestedStart: payload.start.dateTime,
    requestedEnd: payload.end.dateTime,
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

  console.error('CALENDAR_PATCH_REQUEST', {
    pid: process.pid,
    deviceId: deviceId.slice(0, 8),
    eventId,
    oldStart: existing.event.startsAt,
    oldEnd: existing.event.endsAt,
    requestedStart: payload.start.dateTime,
    requestedEnd: payload.end.dateTime,
    timestamp: new Date().toISOString(),
  });

  logCalendarPipeline('patch_payload', { eventId, payload });

  console.error('CALENDAR_PATCH_BEFORE', {
    pid: process.pid,
    eventId,
    timestamp: new Date().toISOString(),
  });

  const patchResult = await fetchGoogleCalendarJson(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        attachGoogleCalendarEventReminders({
          summary: payload.summary,
          location: payload.location,
          start: payload.start,
          end: payload.end,
        }),
      ),
    },
    'events.patch',
  );

  console.error('CALENDAR_PATCH_AFTER', {
    pid: process.pid,
    eventId,
    patchOk: patchResult.ok,
    httpStatus: patchResult.ok ? patchResult.status : patchResult.status ?? null,
    timestamp: new Date().toISOString(),
  });

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

  console.error('CALENDAR_PATCH_RESPONSE', {
    pid: process.pid,
    eventId: patched.id,
    patchedStart: patched.startsAt,
    patchedEnd: patched.endsAt,
    requestedStart: payload.start.dateTime,
    requestedEnd: payload.end.dateTime,
    timestamp: new Date().toISOString(),
  });

  const verification = await verifyUpdatedEventWithRetries({
    eventId,
    payload,
    oldStartsAt: existing.event.startsAt,
    oldEndsAt: existing.event.endsAt,
    readEvent: async () => {
      const getResult = await getGoogleCalendarEventById(tokens, eventId, fallback);

      if (!getResult.ok || !isReadableCalendarEvent(getResult.event)) {
        return null;
      }

      return getResult.event;
    },
  });

  if (!verification.verified || !verification.event) {
    console.error('CALENDAR_VERIFY_FAILED', {
      pid: process.pid,
      eventId,
      oldStart: existing.event.startsAt,
      oldEnd: existing.event.endsAt,
      requestedStart: payload.start.dateTime,
      requestedEnd: payload.end.dateTime,
      patchedStart: patched.startsAt,
      patchedEnd: patched.endsAt,
      attempts: verification.attempts.length,
      finalMismatch: verification.finalMismatch,
      timestamp: new Date().toISOString(),
    });

    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'VERIFY_FAILED',
      errorMessage: 'Patch succeeded but verification failed.',
      patchedEventId: patched.id,
      verificationAttempts: verification.attempts,
      verificationMismatch: verification.finalMismatch,
    };
  }

  logCalendarEventReminderSet({
    eventId: verification.event.id,
    title: verification.event.summary,
  });

  return {
    ok: true as const,
    executionState: 'success' as const,
    verified: true,
    verificationFetched: true,
    event: verification.event,
  };
}
