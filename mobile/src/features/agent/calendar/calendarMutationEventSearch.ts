import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ConversationEventRecord } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { isLocalCalendarStoreFresh } from '@/src/features/agent/calendar/calendarConversationStore';
import {
  deduplicateCalendarEvents,
  logCalendarEventDeduplication,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import { mergeCalendarEventLists } from '@/src/features/agent/calendar/calendarLiveState';
import { resolveMutationSearchDayOffsets } from '@/src/features/agent/calendar/calendarMutationSearchWindow';
import {
  ensureCalendarFreshBeforeMutation,
  mergeMutationSearchEventsWithLocalStore,
} from '@/src/features/agent/calendar/calendarPreMutationRefresh';

export { resolveMutationSearchDayOffsets } from '@/src/features/agent/calendar/calendarMutationSearchWindow';

function finalizeMutationSearchEvents(params: {
  remoteEvents: CalendarEvent[];
  remoteFetchOk: boolean;
  timeMin: string;
  timeMax: string;
}) {
  const mergedWithLocal = mergeMutationSearchEventsWithLocalStore(params.remoteEvents);
  const dedupedEvents = deduplicateCalendarEvents(mergedWithLocal);
  const fetchOk = params.remoteFetchOk || isLocalCalendarStoreFresh();

  logCalendarEventDeduplication({
    stage: 'mutation_search_fetch',
    rawCount: params.remoteEvents.length,
    localStoredCount: mergedWithLocal.length,
    deduplicatedCount: dedupedEvents.length,
  });

  return {
    events: dedupedEvents,
    fetchOk,
    timeMin: params.timeMin,
    timeMax: params.timeMax,
  };
}

export async function fetchCalendarEventsForMutationSearch(params: {
  referenceNow: Date;
  transcript: string;
  memoryRef?: ConversationEventRecord | null;
}): Promise<{
  events: CalendarEvent[];
  fetchOk: boolean;
  timeMin: string;
  timeMax: string;
}> {
  await ensureCalendarFreshBeforeMutation({ referenceNow: params.referenceNow });

  const dayOffsets = resolveMutationSearchDayOffsets({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef: params.memoryRef ?? null,
  });

  if (dayOffsets.length === 1) {
    const { events, range, fetchOk } = await fetchCalendarEventsForZonedDay(
      params.referenceNow,
      dayOffsets[0]!,
    );

    return finalizeMutationSearchEvents({
      remoteEvents: events,
      remoteFetchOk: fetchOk,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    });
  }

  const dayResults = await Promise.all(
    dayOffsets.map((dayOffset) => fetchCalendarEventsForZonedDay(params.referenceNow, dayOffset)),
  );
  const remoteFetchOk = dayResults.every((result) => result.fetchOk);
  const mergedEvents = mergeCalendarEventLists(...dayResults.map((result) => result.events));

  return finalizeMutationSearchEvents({
    remoteEvents: mergedEvents,
    remoteFetchOk,
    timeMin: dayResults[0]!.range.timeMin,
    timeMax: dayResults[dayResults.length - 1]!.range.timeMax,
  });
}
