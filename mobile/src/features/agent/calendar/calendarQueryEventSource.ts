import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  fetchCalendarEventsForHorizon,
  fetchCalendarEventsForZonedDay,
  filterEventsByZonedStartRange,
} from '@/src/features/agent/calendar/calendarAgendaQuery';
import { augmentEventsWithConversationContext } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getCalendarWorkingMemory,
  getDeletedEventTombstones,
  isLocalCalendarStoreFresh,
} from '@/src/features/agent/calendar/calendarConversationStore';
import { getLiveCalendarEvents, mergeCalendarEventLists } from '@/src/features/agent/calendar/calendarLiveState';
import { logCalendarQueryResolution } from '@/src/features/agent/calendar/calendarQueryDiagnostics';
import {
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { getCalendarAgendaWindow, parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

function buildAgendaHorizonRange(referenceNow: Date) {
  const window = getCalendarAgendaWindow(referenceNow);
  const rangeStartMs = parseGoogleCalendarInstant(window.timeMin);
  const rangeEndMs = parseGoogleCalendarInstant(window.timeMax);

  if (rangeStartMs === null || rangeEndMs === null) {
    return null;
  }

  return { rangeStartMs, rangeEndMs };
}

function filterEventsForAgendaHorizon(events: CalendarEvent[], referenceNow: Date) {
  const range = buildAgendaHorizonRange(referenceNow);

  if (!range) {
    return sortEventsChronologically(events.filter(isSchedulableEvent));
  }

  return filterEventsByZonedStartRange(events.filter(isSchedulableEvent), range);
}

function isSchedulableEvent(event: CalendarEvent) {
  return (
    !isCancelledCalendarEvent(event) &&
    isTimedCalendarEvent(event) &&
    Boolean(event.title.trim()) &&
    !getDeletedEventTombstones().has(event.id)
  );
}

function buildLocalCalendarStoreEvents(includeConversationPins: boolean) {
  const snapshot = getCalendarWorkingMemory().lastCalendarSnapshot;
  const live = getLiveCalendarEvents();
  const merged = mergeCalendarEventLists(snapshot, live);

  return includeConversationPins
    ? augmentEventsWithConversationContext(merged)
    : merged.filter((event) => !getDeletedEventTombstones().has(event.id));
}

export function getSessionCalendarStoreEvents() {
  return buildLocalCalendarStoreEvents(true).filter(isSchedulableEvent);
}

export async function loadCalendarQueryEvents(params: {
  referenceNow: Date;
  day: CalendarDayContext;
  transcript?: string;
  supplementalEvents?: CalendarEvent[];
  preferLocalStore?: boolean;
}): Promise<{
  events: CalendarEvent[];
  refreshStatus: 'skipped' | 'ok' | 'failed';
  calendarTrustworthy: boolean;
}> {
  const supplemental = params.supplementalEvents ?? [];
  const localStore = buildLocalCalendarStoreEvents(true);
  const mergedLocal = sortEventsChronologically(
    mergeCalendarEventLists(localStore, supplemental).filter(isSchedulableEvent),
  );
  const localForDay = filterRawEventsForDay(mergedLocal, params.day);

  let remoteEvents: CalendarEvent[] = [];
  let refreshStatus: 'skipped' | 'ok' | 'failed' = 'skipped';

  if (!params.preferLocalStore) {
    try {
      const { events, fetchOk } = await fetchCalendarEventsForZonedDay(
        params.referenceNow,
        params.day.dayOffset,
      );

      if (fetchOk) {
        remoteEvents = events.filter(isSchedulableEvent);
        refreshStatus = 'ok';
      } else {
        refreshStatus = 'failed';
      }
    } catch (error) {
      console.log('[CALENDAR QUERY] remote fetch failed', error);
      refreshStatus = 'failed';
    }
  }

  const remoteForDay = filterRawEventsForDay(remoteEvents, params.day);
  const calendarTrustworthy =
    refreshStatus === 'ok' || (refreshStatus === 'failed' && isLocalCalendarStoreFresh());

  let merged: CalendarEvent[];

  if (refreshStatus === 'ok') {
    merged = sortEventsChronologically(
      filterRawEventsForDay(
        augmentEventsWithConversationContext(
          mergeCalendarEventLists(mergedLocal, remoteEvents),
        ),
        params.day,
      ),
    );
  } else if (calendarTrustworthy) {
    merged = sortEventsChronologically(
      filterRawEventsForDay(
        mergeCalendarEventLists(
          buildLocalCalendarStoreEvents(false),
          supplemental,
        ).filter(isSchedulableEvent),
        params.day,
      ),
    );
  } else {
    merged = remoteForDay.length > 0 ? remoteForDay : [];
  }

  const memory = getCalendarWorkingMemory();

  logCalendarQueryResolution({
    original_user_query: params.transcript?.slice(0, 200) ?? '',
    parsed_time_minutes: null,
    parsed_time_label: null,
    timezone_used: params.day.timezone ?? getExecutiveCalendarTimezone(),
    events_found: merged.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
    })),
    calendar_refresh_status: refreshStatus,
    calendarStore_count: memory.lastCalendarSnapshot.length,
    live_store_count: getLiveCalendarEvents().length,
    remote_fetch_count: remoteEvents.length,
  });

  return { events: merged, refreshStatus, calendarTrustworthy };
}

/** Time-until countdown must search the full agenda horizon, not a single day. */
export async function loadCalendarEventsForTimeUntilQuery(params: {
  referenceNow: Date;
  supplementalEvents?: CalendarEvent[];
  preferLocalStore?: boolean;
}): Promise<{
  events: CalendarEvent[];
  refreshStatus: 'skipped' | 'ok' | 'failed';
  calendarTrustworthy: boolean;
}> {
  const supplemental = params.supplementalEvents ?? [];
  const localStore = buildLocalCalendarStoreEvents(true);
  const mergedLocal = sortEventsChronologically(
    mergeCalendarEventLists(localStore, supplemental).filter(isSchedulableEvent),
  );

  let remoteEvents: CalendarEvent[] = [];
  let refreshStatus: 'skipped' | 'ok' | 'failed' = 'skipped';

  if (!params.preferLocalStore) {
    try {
      const { events, fetchOk } = await fetchCalendarEventsForHorizon(params.referenceNow);

      if (fetchOk) {
        remoteEvents = events.filter(isSchedulableEvent);
        refreshStatus = 'ok';
      } else {
        refreshStatus = 'failed';
      }
    } catch (error) {
      console.log('[CALENDAR QUERY] time-until horizon fetch failed', error);
      refreshStatus = 'failed';
    }
  }

  const calendarTrustworthy =
    refreshStatus === 'ok' || (refreshStatus === 'failed' && isLocalCalendarStoreFresh());

  const merged = sortEventsChronologically(
    filterEventsForAgendaHorizon(
      augmentEventsWithConversationContext(mergeCalendarEventLists(mergedLocal, remoteEvents)),
      params.referenceNow,
    ),
  );

  const memory = getCalendarWorkingMemory();

  logCalendarQueryResolution({
    original_user_query: 'time_until_horizon',
    parsed_time_minutes: null,
    parsed_time_label: null,
    timezone_used: getExecutiveCalendarTimezone(),
    events_found: merged.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
    })),
    calendar_refresh_status: refreshStatus,
    calendarStore_count: memory.lastCalendarSnapshot.length,
    live_store_count: getLiveCalendarEvents().length,
    remote_fetch_count: remoteEvents.length,
  });

  return { events: merged, refreshStatus, calendarTrustworthy };
}
