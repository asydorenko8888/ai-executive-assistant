import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventsFromBackend,
  type GoogleCalendarBackendEvent,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { getEventStartTimestamp, sortEventsChronologically } from '@/src/features/agent/calendar/calendarSchedule';
import { getExecutiveCalendarTimezone, getZonedDayRange } from '@/src/features/agent/calendar/calendarTimezone';

function mapBackendEvent(event: GoogleCalendarBackendEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.summary.trim() || 'Untitled event',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    isAllDay: !event.startsAt.includes('T'),
    attendees: [],
  };
}

function filterEventsInRange(events: CalendarEvent[], rangeStartMs: number, rangeEndMs: number) {
  return events.filter((event) => {
    const startTimestamp = getEventStartTimestamp(event);

    return (
      startTimestamp !== null &&
      startTimestamp >= rangeStartMs &&
      startTimestamp < rangeEndMs
    );
  });
}

async function fetchEventsForDayOffset(referenceNow: Date, dayOffset: number) {
  const timezone = getExecutiveCalendarTimezone();
  const range = getZonedDayRange(referenceNow, dayOffset, timezone);

  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
  }).catch((error) => {
    console.log('[CalendarReminderEngine] fetch failed', {
      dayOffset,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!listed) {
    return [];
  }

  const mapped = (listed.events ?? []).map(mapBackendEvent);
  return filterEventsInRange(mapped, range.rangeStartMs, range.rangeEndMs);
}

/**
 * Read-only calendar fetch for the reminder engine.
 * Does not touch conversation store, mutation paths, or CRUD executors.
 */
export async function fetchCalendarEventsForReminderEngine(referenceNow = new Date()) {
  const [todayEvents, tomorrowEvents] = await Promise.all([
    fetchEventsForDayOffset(referenceNow, 0),
    fetchEventsForDayOffset(referenceNow, 1),
  ]);

  const merged = new Map<string, CalendarEvent>();

  for (const event of [...todayEvents, ...tomorrowEvents]) {
    merged.set(`${event.id}|${event.startsAt}`, event);
  }

  return sortEventsChronologically([...merged.values()]);
}
