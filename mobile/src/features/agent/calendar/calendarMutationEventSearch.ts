import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ConversationEventRecord } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { resolveMutationSearchDayOffset } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { mergeCalendarEventLists } from '@/src/features/agent/calendar/calendarLiveState';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

const EXPLICIT_DAY_IN_TRANSCRIPT =
  /\b(?:today|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра|monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/iu;

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
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    timeZone,
  });

  if (EXPLICIT_DAY_IN_TRANSCRIPT.test(params.transcript)) {
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
  const events = mergeCalendarEventLists(today.events, tomorrow.events);

  return {
    events,
    fetchOk,
    timeMin: today.range.timeMin,
    timeMax: tomorrow.range.timeMax,
  };
}
