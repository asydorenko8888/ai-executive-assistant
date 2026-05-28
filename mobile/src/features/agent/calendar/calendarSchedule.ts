import type { CalendarEvent } from '@/src/entities/calendar/types';
import { formatInstantForDebug, parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

export function getEventStartTimestamp(event: CalendarEvent) {
  return parseGoogleCalendarInstant(event.startsAt);
}

export function getEventEndTimestamp(event: CalendarEvent) {
  return parseGoogleCalendarInstant(event.endsAt);
}

export function isTimedCalendarEvent(event: CalendarEvent) {
  return !event.isAllDay;
}

export function isCancelledCalendarEvent(event: CalendarEvent) {
  return event.isCancelled === true;
}

export function sortEventsChronologically(events: CalendarEvent[]) {
  return [...events].sort((left, right) => {
    const leftStart = getEventStartTimestamp(left);
    const rightStart = getEventStartTimestamp(right);

    if (leftStart === null && rightStart === null) {
      return 0;
    }

    if (leftStart === null) {
      return 1;
    }

    if (rightStart === null) {
      return -1;
    }

    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    const leftEnd = getEventEndTimestamp(left) ?? leftStart;
    const rightEnd = getEventEndTimestamp(right) ?? rightStart;

    return leftEnd - rightEnd;
  });
}

function logScheduleCandidate(event: CalendarEvent, referenceNow: Date) {
  const startTimestamp = getEventStartTimestamp(event);

  console.log('[Schedule] event candidate:', event.title);
  console.log(
    '[Schedule] event timestamp:',
    startTimestamp === null ? 'invalid' : formatInstantForDebug(startTimestamp),
  );

  if (startTimestamp !== null) {
    const minutesUntil = Math.round((startTimestamp - referenceNow.getTime()) / 60000);
    console.log('[Schedule] minutes until start:', minutesUntil);
  }
}

export function logScheduleSelectionContext(events: CalendarEvent[], referenceNow: Date) {
  console.log('[Schedule] current time:', formatInstantForDebug(referenceNow.getTime()));

  sortEventsChronologically(events)
    .filter((event) => !isCancelledCalendarEvent(event) && isTimedCalendarEvent(event))
    .forEach((event) => {
      logScheduleCandidate(event, referenceNow);
    });
}

export function filterUpcomingTimedEvents(events: CalendarEvent[], referenceNow: Date) {
  const nowTimestamp = referenceNow.getTime();

  return sortEventsChronologically(events).filter((event) => {
    if (isCancelledCalendarEvent(event) || !isTimedCalendarEvent(event)) {
      return false;
    }

    const startTimestamp = getEventStartTimestamp(event);

    return startTimestamp !== null && startTimestamp > nowTimestamp;
  });
}

export function filterTimedEventsForDay(
  events: CalendarEvent[],
  referenceNow: Date,
  dayEndTimestamp: number,
) {
  const nowTimestamp = referenceNow.getTime();

  return sortEventsChronologically(events).filter((event) => {
    if (isCancelledCalendarEvent(event) || !isTimedCalendarEvent(event)) {
      return false;
    }

    const startTimestamp = getEventStartTimestamp(event);
    const endTimestamp = getEventEndTimestamp(event);

    if (startTimestamp === null || endTimestamp === null) {
      return false;
    }

    return endTimestamp > nowTimestamp && startTimestamp < dayEndTimestamp;
  });
}

export function findNextScheduledEvent(events: CalendarEvent[], referenceNow: Date) {
  logScheduleSelectionContext(events, referenceNow);

  const upcomingTimedEvents = filterUpcomingTimedEvents(events, referenceNow);
  const nextEvent = upcomingTimedEvents[0];

  console.log('[Schedule] selected next event:', nextEvent?.title ?? 'none');

  return nextEvent;
}

export function getFollowingScheduledEvent(
  events: CalendarEvent[],
  nextEvent: CalendarEvent | undefined,
  referenceNow: Date,
) {
  if (!nextEvent) {
    return undefined;
  }

  const upcomingTimedEvents = filterUpcomingTimedEvents(events, referenceNow);
  const nextIndex = upcomingTimedEvents.findIndex((event) => event.id === nextEvent.id);

  if (nextIndex === -1) {
    return undefined;
  }

  const nextStart = getEventStartTimestamp(nextEvent);

  for (let index = nextIndex + 1; index < upcomingTimedEvents.length; index += 1) {
    const candidate = upcomingTimedEvents[index];
    const candidateStart = getEventStartTimestamp(candidate);

    if (nextStart !== null && candidateStart !== null && candidateStart === nextStart) {
      continue;
    }

    return candidate;
  }

  return undefined;
}

export function getLaterUpcomingEvents(
  events: CalendarEvent[],
  nextEvent: CalendarEvent | undefined,
  referenceNow: Date,
) {
  const upcomingTimedEvents = filterUpcomingTimedEvents(events, referenceNow);

  if (!nextEvent) {
    return upcomingTimedEvents;
  }

  return upcomingTimedEvents.filter((event) => event.id !== nextEvent.id);
}
