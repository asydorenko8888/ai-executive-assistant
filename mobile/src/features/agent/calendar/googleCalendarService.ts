import type {
  CalendarConnection,
  CalendarEvent,
  CalendarFreeWindow,
  CalendarSummary,
  CalendarTimePressure,
} from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventsFromBackend,
  type GoogleCalendarBackendEvent,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { getGoogleCalendarConnection } from '@/src/features/agent/calendar/googleCalendarAuth';
import {
  getLiveCalendarEvents,
  mergeCalendarEventLists,
} from '@/src/features/agent/calendar/calendarLiveState';
import {
  getCalendarAgendaWindow,
  getLocalDayBounds,
  getMinutesUntilEvent,
  logCalendarEventTimeDebug,
  logCalendarTimeContext,
  minutesBetweenTimestamps,
  parseGoogleCalendarInstant,
} from '@/src/features/agent/calendar/calendarTime';
import type { CalendarIntegrationSnapshot } from '@/src/features/agent/integrations';
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

function mapBackendEventToCalendarEvent(event: GoogleCalendarBackendEvent): CalendarEvent | null {
  const startsAt = event.startsAt;
  const endsAt = event.endsAt;

  if (parseGoogleCalendarInstant(startsAt) === null || parseGoogleCalendarInstant(endsAt) === null) {
    return null;
  }

  const rawTitle = event.summary?.trim();

  if (!rawTitle) {
    return null;
  }

  return {
    id: event.id,
    title: rawTitle,
    startsAt,
    endsAt,
    location: event.location?.trim() ? formatLocationShort(event.location) || undefined : undefined,
    isAllDay: !startsAt.includes('T'),
    attendees: [],
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

async function fetchGoogleCalendarEventsForAgenda(referenceDate: Date) {
  const window = getCalendarAgendaWindow(referenceDate);
  const response = await fetchGoogleCalendarEventsFromBackend({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  });

  return sortEventsChronologically(
    response.events
      .map(mapBackendEventToCalendarEvent)
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

  if (connection.status !== 'connected') {
    console.log('[Calendar Audit] getGoogleCalendarMorningContext — not connected', {
      connectionStatus: connection.status,
    });
    return {
      availability: connection.status === 'expired' ? 'not_connected' : 'not_connected',
      connection,
      upcomingEvents: [],
    };
  }

  const parsedReferenceDate = new Date(referenceDate);
  const effectiveReferenceDate = Number.isNaN(parsedReferenceDate.getTime())
    ? new Date()
    : parsedReferenceDate;

  const remoteEvents = await fetchGoogleCalendarEventsForAgenda(effectiveReferenceDate);
  const calendarEvents = mergeCalendarEventLists(getLiveCalendarEvents(), remoteEvents);
  const upcomingEvents = filterUpcomingTimedEvents(calendarEvents, effectiveReferenceDate);

  console.log('[Calendar Audit] getGoogleCalendarMorningContext — fetched real events', {
    remoteCount: remoteEvents.length,
    liveCount: getLiveCalendarEvents().length,
    mergedCount: calendarEvents.length,
    upcomingCount: upcomingEvents.length,
    titles: upcomingEvents.slice(0, 8).map((event) => event.title),
    connectedEmail: connection.connectedEmail ?? null,
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
