import {
  buildTokenDebugLog,
  CALENDAR_EVENTS_WRITE_SCOPE,
  getValidGoogleCalendarAccessToken,
  scopesIncludeCalendarEventsWrite,
  type StoredGoogleCalendarTokens,
} from './googleCalendarTokenStore.js';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CALENDAR_API_TIMEOUT_MS = 25_000;

export type CreateGoogleCalendarEventBody = {
  summary: string;
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

async function fetchGoogleCalendarJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<
  | { ok: true; body: GoogleEventPayload; status: number }
  | { ok: false; timedOut: boolean; status?: number; message: string; rawBody?: unknown }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CALENDAR_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const rawBody = await response.json().catch(() => ({}));
    const body = rawBody as GoogleEventPayload & { error?: { message?: string; code?: number } };

    logCalendarPipeline('api_response', {
      label,
      httpStatus: response.status,
      ok: response.ok,
      body: rawBody,
    });

    if (!response.ok) {
      const message =
        typeof body.error === 'object' && body.error?.message
          ? body.error.message
          : response.statusText || `${label} failed`;

      return {
        ok: false,
        timedOut: false,
        status: response.status,
        message,
        rawBody,
      };
    }

    return { ok: true, body, status: response.status };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';

    logCalendarPipeline('api_response', {
      label,
      ok: false,
      timedOut,
      error: error instanceof Error ? error.message : error,
    });

    return {
      ok: false,
      timedOut,
      message: timedOut ? 'Google Calendar API timeout' : 'Google Calendar network error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
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

  if (!verifiedEvent) {
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
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'VERIFY_FAILED',
      errorMessage: 'Insert succeeded but verified event did not match payload.',
      insertedEventId: inserted.id,
    };
  }

  logCalendarPipeline('verification_success', {
    eventId: verifiedEvent.id,
    summary: verifiedEvent.summary,
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
