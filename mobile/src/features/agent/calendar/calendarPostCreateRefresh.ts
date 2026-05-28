import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventByIdFromBackend,
  fetchGoogleCalendarEventsFromBackend,
  type GoogleCalendarBackendEvent,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  mergeCalendarEventLists,
  setLiveCalendarEvents,
} from '@/src/features/agent/calendar/calendarLiveState';
import { getCalendarAgendaWindow } from '@/src/features/agent/calendar/calendarTime';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { refreshHomeBriefing } from '@/src/features/home/services/refreshHomeBriefing';
import { queryClient } from '@/src/shared/api/query-client';

function logCalendarRefresh(stage: string, details: Record<string, unknown>) {
  console.log(`[Calendar Refresh] ${stage}`, details);
}

function mapBackendEventToCalendarEvent(event: GoogleCalendarBackendEvent): CalendarEvent {
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

export type CalendarPostCreateRefreshResult = {
  verifiedEvent: CalendarEvent | null;
  mergedEvents: CalendarEvent[];
};

function verifyFetchedEvent(params: {
  extractedTitle: string;
  startIso: string;
  endIso: string;
  event: CalendarEvent;
}) {
  const titleMatches =
    params.event.title.trim().toLowerCase() === params.extractedTitle.trim().toLowerCase() ||
    params.event.title.trim().length > 0;
  const startMatches =
    params.event.startsAt.slice(0, 16) === params.startIso.slice(0, 16) ||
    Date.parse(params.event.startsAt) === Date.parse(params.startIso);
  const endMatches =
    params.event.endsAt.slice(0, 16) === params.endIso.slice(0, 16) ||
    Date.parse(params.event.endsAt) === Date.parse(params.endIso);

  return { titleMatches, startMatches, endMatches };
}

export async function refreshCalendarStateAfterCreate(params: {
  eventId: string;
  userTranscript: string;
  extractedTitle: string;
  startIso: string;
  endIso: string;
  referenceNow: Date;
}): Promise<CalendarPostCreateRefreshResult> {
  logCalendarCreate('start/end', {
    start: params.startIso,
    end: params.endIso,
    extractedTitle: params.extractedTitle,
  });

  const window = getCalendarAgendaWindow(params.referenceNow);

  const [fetchedEvent, listed] = await Promise.all([
    fetchGoogleCalendarEventByIdFromBackend(params.eventId).catch((error) => {
      logCalendarRefresh('fetch event by id failed', {
        eventId: params.eventId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
    fetchGoogleCalendarEventsFromBackend({
      timeMin: window.timeMin,
      timeMax: window.timeMax,
    }).catch((error) => {
      logCalendarRefresh('list events failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
  ]);

  const listedEvents = (listed?.events ?? []).map(mapBackendEventToCalendarEvent);
  const verifiedEvent = fetchedEvent?.event
    ? mapBackendEventToCalendarEvent(fetchedEvent.event)
    : null;

  if (verifiedEvent) {
    const verification = verifyFetchedEvent({
      extractedTitle: params.extractedTitle,
      startIso: params.startIso,
      endIso: params.endIso,
      event: verifiedEvent,
    });

    logCalendarCreate('fetched event', {
      eventId: verifiedEvent.id,
      summary: verifiedEvent.title,
      startsAt: verifiedEvent.startsAt,
      endsAt: verifiedEvent.endsAt,
      verification,
    });
  }
  const merged = mergeCalendarEventLists(
    verifiedEvent ? [verifiedEvent] : [],
    listedEvents,
  );

  setLiveCalendarEvents(merged);

  logCalendarRefresh('home state updated', {
    eventCount: merged.length,
    titles: merged.slice(0, 8).map((event) => event.title),
  });

  await refreshHomeBriefing(queryClient);

  logCalendarRefresh('briefing updated', {
    eventId: params.eventId,
  });

  return {
    verifiedEvent,
    mergedEvents: merged,
  };
}

export async function refreshCalendarAgendaState(referenceNow: Date) {
  const window = getCalendarAgendaWindow(referenceNow);
  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  }).catch((error) => {
    logCalendarRefresh('list events failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const merged = (listed?.events ?? []).map(mapBackendEventToCalendarEvent);
  setLiveCalendarEvents(merged);

  logCalendarRefresh('home state updated', {
    eventCount: merged.length,
    titles: merged.slice(0, 8).map((event) => event.title),
  });

  await refreshHomeBriefing(queryClient);

  logCalendarRefresh('briefing updated', { reason: 'agenda_refresh' });

  return merged;
}
