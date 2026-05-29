import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarEventByIdFromBackend,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { refreshCalendarStateAfterMutation } from '@/src/features/agent/calendar/calendarAgendaSync';
import {
  logCalendarCreate,
  logCalendarRefresh,
  logAgendaRefresh,
} from '@/src/features/agent/calendar/calendarPipelineLogger';

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
  logCalendarCreate('post_create_refresh_start', {
    eventId: params.eventId,
    extractedTitle: params.extractedTitle,
    start: params.startIso,
    end: params.endIso,
  });

  const fetchedEvent = await fetchGoogleCalendarEventByIdFromBackend(params.eventId).catch((error) => {
    logCalendarRefresh('fetch_event_by_id_failed', {
      eventId: params.eventId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const verifiedEvent = fetchedEvent?.event
    ? {
        id: fetchedEvent.event.id,
        title: fetchedEvent.event.summary.trim() || 'Untitled event',
        startsAt: fetchedEvent.event.startsAt,
        endsAt: fetchedEvent.event.endsAt,
        location: fetchedEvent.event.location,
        isAllDay: !fetchedEvent.event.startsAt.includes('T'),
        attendees: [],
      }
    : null;

  if (verifiedEvent) {
    const verification = verifyFetchedEvent({
      extractedTitle: params.extractedTitle,
      startIso: params.startIso,
      endIso: params.endIso,
      event: verifiedEvent,
    });

    logCalendarCreate('verified_event', {
      eventId: verifiedEvent.id,
      summary: verifiedEvent.title,
      startsAt: verifiedEvent.startsAt,
      verification,
    });
  }

  const agenda = await refreshCalendarStateAfterMutation({
    referenceNow: params.referenceNow,
    eventId: params.eventId,
    eventStartIso: params.startIso,
    reason: 'post_create',
  });

  logAgendaRefresh('post_create_synced', {
    eventId: params.eventId,
    mergedCount: agenda.horizonEvents.length,
    todayCount: agenda.todayEvents.length,
    tomorrowCount: agenda.tomorrowEvents.length,
  });

  return {
    verifiedEvent,
    mergedEvents: agenda.horizonEvents,
  };
}

export async function refreshCalendarAgendaState(referenceNow: Date) {
  logAgendaRefresh('manual_refresh', { referenceNow: referenceNow.toISOString() });

  const agenda = await refreshCalendarStateAfterMutation({
    referenceNow,
    reason: 'post_mutation',
  });

  return agenda.horizonEvents;
}
