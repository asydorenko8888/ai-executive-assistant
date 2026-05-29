import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import {
  fetchCalendarEventsForAgendaQuery,
  fetchCalendarEventsForZonedDay,
  filterEventsByZonedStartRange,
  logCalendarAnswerEvents,
  mergeLiveEventsReplacingZonedDay,
  isCalendarAgendaQuery,
  resolveAgendaQueryDayOffset,
} from '@/src/features/agent/calendar/calendarAgendaQuery';

export { isCalendarAgendaQuery, resolveAgendaQueryDayOffset } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { invalidateCalendarVisibilityCaches } from '@/src/features/agent/calendar/calendarAgendaRefresh';
import { getLiveCalendarEvents, replaceLiveCalendarEvents } from '@/src/features/agent/calendar/calendarLiveState';
import { buildCalendarSummary } from '@/src/features/agent/calendar/googleCalendarService';
import {
  filterUpcomingTimedEvents,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import {
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  resolveZonedDayOffsetForInstant,
} from '@/src/features/agent/calendar/calendarTimezone';

export function filterEventsOnLocalDay(
  events: CalendarEvent[],
  referenceNow: Date,
  dayOffset: number,
): CalendarEvent[] {
  const timezone = getExecutiveCalendarTimezone();
  const range = getZonedDayRange(referenceNow, dayOffset, timezone);
  const filtered = filterEventsByZonedStartRange(events, range);

  logCalendarAnswerEvents(filtered, timezone);

  return filtered;
}

export function resolveAgendaEventsForQuery(
  events: CalendarEvent[],
  referenceNow: Date,
  userTranscript: string,
) {
  const dayOffset = resolveAgendaQueryDayOffset(userTranscript);

  if (dayOffset !== null) {
    return filterEventsOnLocalDay(events, referenceNow, dayOffset);
  }

  const visible = filterVisibleCalendarEvents(events, referenceNow);
  logCalendarAnswerEvents(visible, getExecutiveCalendarTimezone());

  return visible;
}

export async function clearAssistantCalendarAgendaCache(referenceNow = new Date()) {
  await invalidateCalendarVisibilityCaches(referenceNow);
}

export async function refreshCalendarStateAfterMutation(params: {
  referenceNow: Date;
  eventId?: string | null;
  eventStartIso?: string | null;
  reason?: 'post_create' | 'post_mutation';
}) {
  await clearAssistantCalendarAgendaCache(params.referenceNow);

  const timezone = getExecutiveCalendarTimezone();

  if (params.eventStartIso) {
    const dayOffset = resolveZonedDayOffsetForInstant(
      params.eventStartIso,
      params.referenceNow,
      timezone,
    );
    const safeDayOffset = dayOffset ?? 0;
    const { events, range } = await fetchCalendarEventsForZonedDay(params.referenceNow, safeDayOffset);
    const merged = mergeLiveEventsReplacingZonedDay(getLiveCalendarEvents(), events, range);
    replaceLiveCalendarEvents(merged);

    return {
      horizonEvents: merged,
      todayEvents: filterEventsOnLocalDay(merged, params.referenceNow, 0),
      tomorrowEvents: filterEventsOnLocalDay(merged, params.referenceNow, 1),
    };
  }

  const [today, tomorrow] = await Promise.all([
    fetchCalendarEventsForZonedDay(params.referenceNow, 0),
    fetchCalendarEventsForZonedDay(params.referenceNow, 1),
  ]);
  const merged = sortEventsChronologically([...today.events, ...tomorrow.events]);
  replaceLiveCalendarEvents(merged);

  return {
    horizonEvents: merged,
    todayEvents: today.events,
    tomorrowEvents: tomorrow.events,
  };
}

export async function syncFreshCalendarStateForAgendaQuery(params: {
  referenceNow: Date;
  userTranscript: string;
}) {
  await clearAssistantCalendarAgendaCache(params.referenceNow);

  const events = await fetchCalendarEventsForAgendaQuery({
    referenceNow: params.referenceNow,
    userTranscript: params.userTranscript,
  });

  const dayOffset = resolveAgendaQueryDayOffset(params.userTranscript);

  if (dayOffset !== null) {
    const range = getZonedDayRange(params.referenceNow, dayOffset, getExecutiveCalendarTimezone());
    const merged = mergeLiveEventsReplacingZonedDay(getLiveCalendarEvents(), events, range);
    replaceLiveCalendarEvents(merged);
    return events;
  }

  replaceLiveCalendarEvents(events);
  return events;
}

export function patchExecutiveSnapshotCalendar(
  snapshot: ExecutiveAgentSnapshot,
  events: CalendarEvent[],
  referenceNow: Date,
) {
  if (!snapshot.calendarConnection || snapshot.calendarConnection.status !== 'connected') {
    return;
  }

  const sorted = sortEventsChronologically(events);
  snapshot.upcomingCalendarEvents = filterUpcomingTimedEvents(sorted, referenceNow);
  snapshot.calendarSummary = buildCalendarSummary(
    sorted,
    snapshot.calendarConnection,
    referenceNow,
  );
}

export async function ensureFreshCalendarForAgendaTurn(params: {
  orchestrator: ExecutiveAgentOrchestrator;
  referenceNow: Date;
  userTranscript: string;
  calendarConnected: boolean;
}): Promise<CalendarEvent[]> {
  if (!params.calendarConnected || !isCalendarAgendaQuery(params.userTranscript)) {
    const snapshotEvents = getAssistantVisibleCalendarEvents(
      params.orchestrator.snapshot,
      params.referenceNow,
    );
    return resolveAgendaEventsForQuery(snapshotEvents, params.referenceNow, params.userTranscript);
  }

  const events = await syncFreshCalendarStateForAgendaQuery({
    referenceNow: params.referenceNow,
    userTranscript: params.userTranscript,
  });

  patchExecutiveSnapshotCalendar(params.orchestrator.snapshot, getLiveCalendarEvents(), params.referenceNow);

  return events;
}
