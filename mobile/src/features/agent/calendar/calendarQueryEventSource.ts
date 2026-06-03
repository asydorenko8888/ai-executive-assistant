import type { CalendarEvent } from '@/src/entities/calendar/types';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
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
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

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
  const includePins = params.preferLocalStore ?? false;
  const localStore = buildLocalCalendarStoreEvents(includePins);
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
