import type {
  CalendarConnection,
  CalendarEvent,
  CalendarFreeWindow,
  CalendarSummary,
  CalendarTimePressure,
} from '@/src/entities/calendar/types';
import {
  getActiveGoogleCalendarSession,
  getGoogleCalendarConnection,
} from '@/src/features/agent/calendar/googleCalendarAuth';
import {
  getLocalDayBounds,
  getMinutesUntilEvent,
  logCalendarEventTimeDebug,
  logCalendarTimeContext,
  minutesBetweenTimestamps,
  parseGoogleCalendarInstant,
} from '@/src/features/agent/calendar/calendarTime';
import type { CalendarIntegrationSnapshot } from '@/src/features/agent/integrations';
import { humanizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitle';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import {
  buildCalendarAvailabilitySummary,
  buildCalendarTransitionSummary,
} from '@/src/features/agent/calendar/calendarNaturalLanguage';
import {
  filterTimedEventsForDay,
  filterUpcomingTimedEvents,
  findNextScheduledEvent,
  getFollowingScheduledEvent,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type GoogleCalendarEventResponse = {
  items?: {
    id?: string;
    summary?: string;
    location?: string;
    attendees?: {
      email?: string;
    }[];
    start?: {
      dateTime?: string;
      date?: string;
    };
    end?: {
      dateTime?: string;
      date?: string;
    };
    status?: string;
  }[];
};

function normalizeGoogleCalendarEvent(
  event: NonNullable<GoogleCalendarEventResponse['items']>[number],
): CalendarEvent | null {
  const rawStart = event.start?.dateTime ?? event.start?.date;
  const rawEnd = event.end?.dateTime ?? event.end?.date;

  if (!rawStart || !rawEnd) {
    return null;
  }

  if (event.status === 'cancelled') {
    return null;
  }

  const isAllDay = !event.start?.dateTime;
  const startsAt = rawStart;
  const endsAt = rawEnd;

  if (parseGoogleCalendarInstant(startsAt) === null || parseGoogleCalendarInstant(endsAt) === null) {
    return null;
  }

  const rawTitle = event.summary?.trim() || 'Untitled event';

  return {
    id: event.id ?? `${startsAt}-${event.summary ?? 'event'}`,
    title: humanizeCalendarEventTitle(rawTitle),
    startsAt,
    endsAt,
    location: event.location?.trim() ? formatLocationShort(event.location) || undefined : undefined,
    isAllDay,
    attendees:
      event.attendees?.map((attendee) => attendee.email?.trim()).filter((email): email is string => Boolean(email)) ??
      [],
  };
}

function buildFreeWindows(events: CalendarEvent[], referenceDate: Date) {
  const { dayStart, dayEnd } = getLocalDayBounds(referenceDate);
  const nowTimestamp = referenceDate.getTime();
  const windows: CalendarFreeWindow[] = [];
  let cursor = Math.max(dayStart.getTime(), nowTimestamp);

  const timedEvents = events.filter((event) => !event.isAllDay);

  timedEvents.forEach((event) => {
    const eventStart = parseGoogleCalendarInstant(event.startsAt);
    const eventEnd = parseGoogleCalendarInstant(event.endsAt);

    if (eventStart === null || eventEnd === null) {
      return;
    }

    if (eventEnd <= cursor) {
      cursor = Math.max(cursor, eventEnd);
      return;
    }

    if (eventStart > cursor) {
      windows.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(eventStart).toISOString(),
        durationMinutes: minutesBetweenTimestamps(cursor, eventStart),
      });
    }

    cursor = Math.max(cursor, eventEnd);
  });

  if (cursor < dayEnd.getTime()) {
    windows.push({
      startsAt: new Date(cursor).toISOString(),
      endsAt: dayEnd.toISOString(),
      durationMinutes: minutesBetweenTimestamps(cursor, dayEnd.getTime()),
    });
  }

  return windows.filter((window) => window.durationMinutes >= 15);
}

function calculateTimePressure(eventsCount: number, busyMinutes: number, hasBackToBackMeetings: boolean): CalendarTimePressure {
  if (eventsCount >= 6 || busyMinutes >= 300 || hasBackToBackMeetings) {
    return 'heavy';
  }

  if (eventsCount >= 3 || busyMinutes >= 180) {
    return 'moderate';
  }

  return 'light';
}

function buildCalendarSummary(
  events: CalendarEvent[],
  connection: CalendarConnection,
  referenceDate: Date,
): CalendarSummary {
  const sortedEvents = sortEventsChronologically(events);
  const nowTimestamp = referenceDate.getTime();
  const { dayStart, dayEnd } = getLocalDayBounds(referenceDate);
  const upcomingTimedEvents = filterUpcomingTimedEvents(sortedEvents, referenceDate);
  const timedEventsForDay = filterTimedEventsForDay(sortedEvents, referenceDate, dayEnd.getTime());

  logCalendarTimeContext(referenceDate);

  sortedEvents.forEach((event) => {
    logCalendarEventTimeDebug({
      eventTitle: event.title,
      rawStart: event.startsAt,
      referenceNow: referenceDate,
    });
  });

  const freeWindows = buildFreeWindows(timedEventsForDay, referenceDate);
  const focusBlocks = freeWindows.filter((window) => window.durationMinutes >= 60);
  const timedEvents = timedEventsForDay;

  const busyMinutes = timedEvents.reduce((totalBusyMinutes, event) => {
    const startsAt = parseGoogleCalendarInstant(event.startsAt);
    const endsAt = parseGoogleCalendarInstant(event.endsAt);

    if (startsAt === null || endsAt === null) {
      return totalBusyMinutes;
    }

    const overlapStart = Math.max(startsAt, dayStart.getTime(), nowTimestamp);
    const overlapEnd = Math.min(endsAt, dayEnd.getTime());

    if (overlapEnd <= overlapStart) {
      return totalBusyMinutes;
    }

    return totalBusyMinutes + minutesBetweenTimestamps(overlapStart, overlapEnd);
  }, 0);

  const dayDurationMinutes = minutesBetweenTimestamps(
    Math.max(dayStart.getTime(), nowTimestamp),
    dayEnd.getTime(),
  );
  const freeMinutes = Math.max(0, dayDurationMinutes - busyMinutes);
  const nextEvent = findNextScheduledEvent(sortedEvents, referenceDate);
  const followingEvent = getFollowingScheduledEvent(sortedEvents, nextEvent, referenceDate);
  const nextFreeWindow = freeWindows.find((window) => {
    const windowEnd = parseGoogleCalendarInstant(window.endsAt);
    return windowEnd !== null && windowEnd > nowTimestamp;
  });

  const minutesUntilNextEvent = nextEvent ? getMinutesUntilEvent(nextEvent.startsAt, referenceDate) : null;

  const hasBackToBackMeetings = timedEvents.some((event, index) => {
    const currentEventEnd = parseGoogleCalendarInstant(event.endsAt);
    const nextTimedEvent = timedEvents[index + 1];

    if (!nextTimedEvent) {
      return false;
    }

    const nextEventStart = parseGoogleCalendarInstant(nextTimedEvent.startsAt);

    if (currentEventEnd === null || nextEventStart === null) {
      return false;
    }

    return minutesBetweenTimestamps(currentEventEnd, nextEventStart) <= 20;
  });

  const timePressure = calculateTimePressure(timedEvents.length, busyMinutes, hasBackToBackMeetings);
  const transitionSummary = buildCalendarTransitionSummary({
    nextEvent,
    followingEvent,
    nextFreeWindow,
    hasBackToBackMeetings,
    timePressure,
    freeMinutes,
    busyMinutes,
    eventsCount: upcomingTimedEvents.length,
    dayDurationMinutes,
    minutesUntilNextEvent,
    referenceDate,
  });

  const calendarSummary = {
    date: dayStart.toISOString(),
    eventsCount: upcomingTimedEvents.length,
    focusBlocksCount: focusBlocks.length,
    nextEvent,
    followingEvent,
    nextFreeWindow,
    freeWindows,
    busyMinutes,
    freeMinutes,
    timePressure,
    hasBackToBackMeetings,
    transitionSummary,
    availabilitySummary: '',
    connectedEmail: connection.connectedEmail,
  };

  calendarSummary.availabilitySummary = buildCalendarAvailabilitySummary(
    calendarSummary,
    referenceDate,
    minutesUntilNextEvent,
  );

  return calendarSummary;
}

async function fetchUpcomingGoogleCalendarEvents(accessToken: string, referenceDate: Date) {
  const { timeMin, timeMax } = getLocalDayBounds(referenceDate);

  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=${encodeURIComponent(
      timeMin,
    )}&timeMax=${encodeURIComponent(timeMax)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.log('[Calendar Audit] fetchUpcomingGoogleCalendarEvents — API error', {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error('Unable to fetch Google Calendar events.');
  }

  const payload = (await response.json()) as GoogleCalendarEventResponse;

  return sortEventsChronologically(
    (payload.items ?? [])
      .map(normalizeGoogleCalendarEvent)
      .filter((event): event is CalendarEvent => Boolean(event)),
  );
}

export async function getGoogleCalendarMorningContext(referenceDate: string): Promise<CalendarIntegrationSnapshot> {
  console.log('[Calendar Audit] getGoogleCalendarMorningContext — start', { referenceDate });

  const connection = await getGoogleCalendarConnection();

  if (connection.status === 'missing_config') {
    console.log('[Calendar Audit] getGoogleCalendarMorningContext — missing_config');
    return {
      availability: 'coming_soon',
      connection,
      upcomingEvents: [],
    };
  }

  const activeSession = await getActiveGoogleCalendarSession();

  if (!activeSession) {
    console.log('[Calendar Audit] getGoogleCalendarMorningContext — no active session', {
      connectionStatus: connection.status,
    });
    return {
      availability: connection.status === 'expired' ? 'not_connected' : 'not_connected',
      connection: {
        ...connection,
        status: connection.status === 'expired' ? 'expired' : 'not_connected',
      },
      upcomingEvents: [],
    };
  }

  const parsedReferenceDate = new Date(referenceDate);
  const effectiveReferenceDate = Number.isNaN(parsedReferenceDate.getTime())
    ? new Date()
    : parsedReferenceDate;

  const calendarEvents = await fetchUpcomingGoogleCalendarEvents(
    activeSession.accessToken,
    effectiveReferenceDate,
  );

  const upcomingEvents = filterUpcomingTimedEvents(calendarEvents, effectiveReferenceDate);

  console.log('[Calendar Audit] getGoogleCalendarMorningContext — fetched real events', {
    totalForDay: calendarEvents.length,
    upcomingCount: upcomingEvents.length,
    titles: upcomingEvents.slice(0, 8).map((event) => event.title),
    connectedEmail: activeSession.connectedEmail ?? connection.connectedEmail ?? null,
  });

  return {
    availability: 'available',
    connection: {
      ...connection,
      status: 'connected',
    },
    summary: buildCalendarSummary(calendarEvents, connection, effectiveReferenceDate),
    upcomingEvents,
  };
}
