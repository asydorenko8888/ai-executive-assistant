import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { GoogleCalendarBackendEvent } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { fetchGoogleCalendarEventsFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  mergeCalendarEventLists,
  setLiveCalendarEvents,
} from '@/src/features/agent/calendar/calendarLiveState';
import {
  getLocalDayBounds,
  getCalendarAgendaWindow,
} from '@/src/features/agent/calendar/calendarTime';
import { logAgendaRefresh, logCalendarRefresh } from '@/src/features/agent/calendar/calendarPipelineLogger';
import { queryClient } from '@/src/shared/api/query-client';
import { queryKeys } from '@/src/shared/api/query-keys';

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

function dayKey(referenceNow: Date, dayOffset: number) {
  const date = new Date(referenceNow);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

async function fetchEventsForDay(referenceNow: Date, dayOffset: number) {
  const date = new Date(referenceNow);
  date.setDate(date.getDate() + dayOffset);
  const bounds = getLocalDayBounds(date);

  logCalendarRefresh('fetch_by_date', {
    dayOffset,
    dayKey: dayKey(referenceNow, dayOffset),
    timeMin: bounds.timeMin,
    timeMax: bounds.timeMax,
  });

  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: bounds.timeMin,
    timeMax: bounds.timeMax,
  }).catch((error) => {
    logCalendarRefresh('fetch_by_date_failed', {
      dayOffset,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  return (listed?.events ?? []).map(mapBackendEvent);
}

export async function invalidateCalendarVisibilityCaches(referenceNow: Date) {
  logCalendarRefresh('invalidate_caches', {
    today: dayKey(referenceNow, 0),
    tomorrow: dayKey(referenceNow, 1),
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.agent.homePreview() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.agent.briefing() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.root }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events('today') }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events('tomorrow') }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events('upcoming') }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events(dayKey(referenceNow, 0)) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events(dayKey(referenceNow, 1)) }),
  ]);

  await queryClient.refetchQueries({ queryKey: queryKeys.agent.homePreview() });
}

export async function refreshAgendaVisibilityState(params: {
  referenceNow: Date;
  eventId?: string | null;
  reason: 'post_create' | 'manual' | 'agenda_sync';
}) {
  logAgendaRefresh('start', {
    reason: params.reason,
    eventId: params.eventId ?? null,
  });

  const window = getCalendarAgendaWindow(params.referenceNow);
  const [todayEvents, tomorrowEvents, horizonListed] = await Promise.all([
    fetchEventsForDay(params.referenceNow, 0),
    fetchEventsForDay(params.referenceNow, 1),
    fetchGoogleCalendarEventsFromBackend({
      timeMin: window.timeMin,
      timeMax: window.timeMax,
    }).catch((error) => {
      logCalendarRefresh('horizon_fetch_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
  ]);

  const horizonEvents = (horizonListed?.events ?? []).map(mapBackendEvent);
  const merged = mergeCalendarEventLists(horizonEvents, [...todayEvents, ...tomorrowEvents]);

  setLiveCalendarEvents(merged);

  logAgendaRefresh('live_state_updated', {
    todayCount: todayEvents.length,
    tomorrowCount: tomorrowEvents.length,
    horizonCount: horizonEvents.length,
    mergedCount: merged.length,
    titles: merged.slice(0, 10).map((event) => event.title),
  });

  await invalidateCalendarVisibilityCaches(params.referenceNow);

  logAgendaRefresh('complete', {
    reason: params.reason,
    eventId: params.eventId ?? null,
    today: todayEvents.map((event) => ({ id: event.id, title: event.title })),
    tomorrow: tomorrowEvents.map((event) => ({ id: event.id, title: event.title })),
  });

  return {
    todayEvents,
    tomorrowEvents,
    horizonEvents: merged,
  };
}

export async function fetchEventsByDate(referenceNow: Date, dayOffset: number) {
  return fetchEventsForDay(referenceNow, dayOffset);
}
