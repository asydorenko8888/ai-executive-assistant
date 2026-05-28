import { getValidGoogleCalendarAccessToken } from './googleCalendarTokenStore.js';

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

function logCalendarAudit(stage: string, details: Record<string, unknown>) {
  console.log(`[CalendarExecutionAudit] ${stage}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

async function fetchGoogleCalendarJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<{ ok: true; body: GoogleEventPayload } | { ok: false; timedOut: boolean; status?: number; message: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CALENDAR_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as GoogleEventPayload & {
      error?: { message?: string };
    };

    if (!response.ok) {
      const message =
        typeof body.error === 'object' && body.error?.message
          ? body.error.message
          : response.statusText || `${label} failed`;

      logCalendarAudit('api_response', {
        label,
        ok: false,
        status: response.status,
        message,
      });

      return {
        ok: false,
        timedOut: false,
        status: response.status,
        message,
      };
    }

    logCalendarAudit('api_response', {
      label,
      ok: true,
      eventId: body.id ?? null,
      status: body.status ?? null,
    });

    return { ok: true, body };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';

    logCalendarAudit('api_response', {
      label,
      ok: false,
      timedOut,
      message: timedOut ? 'Google Calendar API timeout' : error instanceof Error ? error.message : 'Network error',
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

async function getGoogleCalendarEventForDevice(deviceId: string, eventId: string, fallback: CreateGoogleCalendarEventBody) {
  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected on the server.',
    };
  }

  const result = await fetchGoogleCalendarJson(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    },
    'events.get',
  );

  if (!result.ok) {
    return {
      ok: false as const,
      errorCode: result.timedOut ? 'calendar_confirmation_timeout' : 'calendar_verification_failed',
      errorMessage: result.message,
    };
  }

  const event = normalizeEvent(result.body, fallback);

  if (!event) {
    return {
      ok: false as const,
      errorCode: 'calendar_verification_failed',
      errorMessage: 'Fetched event failed validation.',
    };
  }

  return {
    ok: true as const,
    event,
  };
}

export async function createGoogleCalendarEventForDevice(
  deviceId: string,
  payload: CreateGoogleCalendarEventBody,
) {
  logCalendarAudit('request', {
    deviceId: deviceId.slice(0, 8),
    summary: payload.summary,
    start: payload.start,
  });

  logCalendarAudit('parsed_intent', {
    summary: payload.summary,
    location: payload.location ?? null,
    timeZone: payload.start.timeZone,
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

  logCalendarAudit('tool_call', { operation: 'events.insert', calendarId: 'primary' });

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
          ? 'calendar_write_forbidden'
          : 'calendar_api_unavailable',
      errorMessage: insertResult.message,
      httpStatus: insertResult.status,
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
    };
  }

  logCalendarAudit('tool_call', { operation: 'events.get', eventId: inserted.id });

  const verifiedFetch = await getGoogleCalendarEventForDevice(deviceId, inserted.id, payload);

  logCalendarAudit('verification_response', {
    eventId: inserted.id,
    fetched: verifiedFetch.ok,
    matched: verifiedFetch.ok ? eventsRoughlyMatch(inserted, verifiedFetch.event, payload) : false,
  });

  if (!verifiedFetch.ok) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: false,
      errorCode: verifiedFetch.errorCode,
      errorMessage: verifiedFetch.errorMessage,
    };
  }

  if (!eventsRoughlyMatch(inserted, verifiedFetch.event, payload)) {
    return {
      ok: false as const,
      executionState: 'failed' as const,
      verified: false,
      verificationFetched: true,
      errorCode: 'calendar_verification_failed',
      errorMessage: 'Fetched event did not match the insert payload.',
    };
  }

  return {
    ok: true as const,
    executionState: 'success' as const,
    verified: true,
    verificationFetched: true,
    event: verifiedFetch.event,
  };
}
