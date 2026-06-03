import { fetchGoogleCalendarApiJson } from './googleCalendarApiClient.js';
import { getValidGoogleCalendarAccessToken } from './googleCalendarTokenStore.js';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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
  const result = await fetchGoogleCalendarApiJson({
    url,
    init: {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    label,
    operation: 'read',
  });

  console.log('[GoogleCalendarRead]', label, {
    httpStatus: result.ok ? result.status : result.status ?? null,
    ok: result.ok,
    attempts: result.attempts,
  });

  if (result.ok) {
    return { ok: true as const, body: result.body };
  }

  return {
    ok: false as const,
    status: result.status,
    message: result.message,
  };
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
