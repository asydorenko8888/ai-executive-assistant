import { getValidGoogleCalendarAccessToken } from './googleCalendarTokenStore.js';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CALENDAR_API_TIMEOUT_MS = 25_000;

export type GoogleCalendarEventRecord = {
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

async function fetchGoogleCalendarJson(url: string, accessToken: string, label: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CALENDAR_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const rawBody = await response.json().catch(() => ({}));

    console.log('[GoogleCalendarRead]', label, {
      httpStatus: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const body = rawBody as { error?: { message?: string } };
      const message =
        typeof body.error === 'object' && body.error?.message
          ? body.error.message
          : response.statusText || `${label} failed`;

      return {
        ok: false as const,
        status: response.status,
        message,
      };
    }

    return { ok: true as const, body: rawBody };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';

    return {
      ok: false as const,
      message: timedOut ? 'Google Calendar API timeout' : 'Google Calendar network error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeGoogleEvent(body: GoogleEventPayload): GoogleCalendarEventRecord | null {
  const id = body.id?.trim();
  const startsAt = body.start?.dateTime ?? body.start?.date;
  const endsAt = body.end?.dateTime ?? body.end?.date;

  if (!id || !startsAt || !endsAt || body.status === 'cancelled') {
    return null;
  }

  return {
    id,
    summary: body.summary?.trim() || 'Untitled event',
    location: body.location?.trim() || undefined,
    startsAt,
    endsAt,
    htmlLink: body.htmlLink?.trim() || undefined,
  };
}

export async function listGoogleCalendarEventsForDevice(
  deviceId: string,
  params: { timeMin: string; timeMax: string },
) {
  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      errorCode: 'calendar_not_connected',
      message: 'Google Calendar is not connected.',
    };
  }

  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(params.timeMin)}&timeMax=${encodeURIComponent(params.timeMax)}`;
  const result = await fetchGoogleCalendarJson(url, tokens.accessToken, 'events.list');

  if (!result.ok) {
    return {
      ok: false as const,
      errorCode: 'calendar_api_unavailable',
      message: result.message,
    };
  }

  const listPayload = result.body as { items?: GoogleEventPayload[] };
  const events = (listPayload.items ?? [])
    .map(normalizeGoogleEvent)
    .filter((event): event is GoogleCalendarEventRecord => Boolean(event));

  return {
    ok: true as const,
    events,
  };
}

export async function getGoogleCalendarEventForDevice(deviceId: string, eventId: string) {
  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      errorCode: 'calendar_not_connected',
      message: 'Google Calendar is not connected.',
    };
  }

  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`;
  const result = await fetchGoogleCalendarJson(url, tokens.accessToken, 'events.get');

  if (!result.ok) {
    return {
      ok: false as const,
      errorCode: 'calendar_api_unavailable',
      message: result.message,
    };
  }

  const event = normalizeGoogleEvent(result.body as GoogleEventPayload);

  if (!event) {
    return {
      ok: false as const,
      errorCode: 'calendar_event_not_found',
      message: 'Event not found or invalid.',
    };
  }

  return {
    ok: true as const,
    event,
  };
}
