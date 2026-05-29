import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { GoogleCalendarBackendEvent } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { fetchGoogleCalendarEventsFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  mergeCalendarEventLists,
  replaceLiveCalendarEvents,
} from '@/src/features/agent/calendar/calendarLiveState';
import {
  getCalendarAgendaWindow,
  getLocalDayBounds,
  getLocalStartOfDay,
  parseGoogleCalendarInstant,
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

function uniqueDayOffsets(offsets: number[]) {
  return Array.from(new Set(offsets.filter((offset) => Number.isFinite(offset) && offset >= 0 && offset <= 14)));
}

function resolveFocusDayOffsets(
  referenceNow: Date,
  focusDayOffsets?: number[],
  eventStartIso?: string | null,
) {
  const offsets = new Set<number>(focusDayOffsets ?? [0, 1]);

  if (eventStartIso) {
    const parsed = parseGoogleCalendarInstant(eventStartIso);

    if (parsed !== null) {
      const refDay = getLocalStartOfDay(referenceNow).getTime();
      const eventDay = getLocalStartOfDay(new Date(parsed)).getTime();
      const dayOffset = Math.round((eventDay - refDay) / 86400000);
      offsets.add(dayOffset);
      offsets.add(0);
      offsets.add(1);
    }
  }

  return uniqueDayOffsets([...offsets]);
}

export async function refreshAgendaVisibilityState(params: {
  referenceNow: Date;
  eventId?: string | null;
  reason: 'post_create' | 'post_mutation' | 'manual' | 'agenda_sync';
  focusDayOffsets?: number[];
  eventStartIso?: string | null;
}) {
  logAgendaRefresh('start', {
    reason: params.reason,
    eventId: params.eventId ?? null,
  });

  const focusOffsets = resolveFocusDayOffsets(
    params.referenceNow,
    params.focusDayOffsets,
    params.eventStartIso ?? null,
  );
  const window = getCalendarAgendaWindow(params.referenceNow);
  const focusedDayFetches = focusOffsets.map((dayOffset: number) =>
    fetchEventsForDay(params.referenceNow, dayOffset),
  );
  const [todayEvents, tomorrowEvents, horizonListed, ...extraFocusedEvents] = await Promise.all([
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
    ...focusedDayFetches,
  ]);

  const horizonEvents = (horizonListed?.events ?? []).map(mapBackendEvent);
  const dayScopedEvents = mergeCalendarEventLists(
    todayEvents,
    mergeCalendarEventLists(tomorrowEvents, extraFocusedEvents.flat()),
  );
  const merged = mergeCalendarEventLists(dayScopedEvents, horizonEvents);

  replaceLiveCalendarEvents(merged);

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
