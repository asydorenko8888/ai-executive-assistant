import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ConversationEventRecord } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { resolveMutationSearchDayOffset } from '@/src/features/agent/calendar/calendarActiveEventContext';
import {
  deduplicateCalendarEvents,
  logCalendarEventDeduplication,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import { mergeCalendarEventLists } from '@/src/features/agent/calendar/calendarLiveState';
import { parseCalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';

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
  const timeZone = getExecutiveCalendarTimezone();
  const memoryRef = params.memoryRef ?? null;
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    schedule,
    timeZone,
  });
  const namedDay =
    parseNaturalDayOffset(params.transcript, params.referenceNow, timeZone) !== null;

  if (namedDay) {
    const { events, range, fetchOk } = await fetchCalendarEventsForZonedDay(
      params.referenceNow,
      searchDayOffset,
    );

    return {
      events,
      fetchOk,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    };
  }

  const [today, tomorrow] = await Promise.all([
    fetchCalendarEventsForZonedDay(params.referenceNow, 0),
    fetchCalendarEventsForZonedDay(params.referenceNow, 1),
  ]);
  const fetchOk = today.fetchOk && tomorrow.fetchOk;
  const mergedEvents = mergeCalendarEventLists(today.events, tomorrow.events);
  const dedupedEvents = deduplicateCalendarEvents(mergedEvents);

  logCalendarEventDeduplication({
    stage: 'mutation_search_fetch',
    rawCount: mergedEvents.length,
    deduplicatedCount: dedupedEvents.length,
  });

  return {
    events: dedupedEvents,
    fetchOk,
    timeMin: today.range.timeMin,
    timeMax: tomorrow.range.timeMax,
  };
}
