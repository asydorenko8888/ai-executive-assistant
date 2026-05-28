import { getValidGoogleCalendarAccessToken } from './googleCalendarTokenStore.js';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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

export async function createGoogleCalendarEventForDevice(
  deviceId: string,
  payload: CreateGoogleCalendarEventBody,
) {
  const tokens = await getValidGoogleCalendarAccessToken(deviceId);

  if (!tokens) {
    return {
      ok: false as const,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected on the server.',
    };
  }

  const response = await fetch(GOOGLE_CALENDAR_EVENTS_ENDPOINT, {
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
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const apiMessage =
      typeof body.error === 'object' &&
      body.error !== null &&
      'message' in body.error &&
      typeof (body.error as { message?: string }).message === 'string'
        ? (body.error as { message: string }).message
        : response.statusText;

    return {
      ok: false as const,
      errorCode: response.status === 403 ? 'calendar_write_forbidden' : 'calendar_api_unavailable',
      errorMessage: apiMessage || 'Google Calendar API unavailable.',
      httpStatus: response.status,
    };
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const summary = typeof body.summary === 'string' ? body.summary : payload.summary;
  const location = typeof body.location === 'string' ? body.location : payload.location;
  const startsAt =
    typeof body.start === 'object' &&
    body.start !== null &&
    'dateTime' in body.start &&
    typeof (body.start as { dateTime?: string }).dateTime === 'string'
      ? (body.start as { dateTime: string }).dateTime
      : payload.start.dateTime;
  const endsAt =
    typeof body.end === 'object' &&
    body.end !== null &&
    'dateTime' in body.end &&
    typeof (body.end as { dateTime?: string }).dateTime === 'string'
      ? (body.end as { dateTime: string }).dateTime
      : payload.end.dateTime;
  const htmlLink = typeof body.htmlLink === 'string' ? body.htmlLink : undefined;

  if (!id || !startsAt) {
    return {
      ok: false as const,
      errorCode: 'calendar_verification_failed',
      errorMessage: 'Google Calendar response could not be verified.',
      httpStatus: response.status,
    };
  }

  const event: CreatedGoogleCalendarEvent = {
    id,
    summary,
    location,
    startsAt,
    endsAt,
    htmlLink,
  };

  return {
    ok: true as const,
    event,
  };
}
