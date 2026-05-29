import type { CalendarEvent } from '@/src/entities/calendar/types';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  findCalendarEventAtTimeFromEvents,
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

export {
  findCalendarEventAtTimeFromEvents,
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

export async function findCalendarEventAtTime(params: {
  transcript: string;
  referenceNow: Date;
  titleQuery?: string;
  clockMinutes?: number;
}): Promise<{
  match: CalendarEvent | null;
  titleQuery: string;
  clockMinutes: number | null;
  candidates: CalendarEvent[];
}> {
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  return findCalendarEventAtTimeFromEvents({
    events,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    titleQuery: params.titleQuery,
    clockMinutes: params.clockMinutes,
    timeZone,
  });
}

export async function findCalendarEventForDelete(params: {
  transcript: string;
  referenceNow: Date;
  titleQuery: string;
}): Promise<ReturnType<typeof findCalendarEventForDeleteFromEvents>> {
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  return findCalendarEventForDeleteFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery: params.titleQuery,
    timeZone,
  });
}

export async function findCalendarEventForUpdate(params: {
  transcript: string;
  referenceNow: Date;
  titleQuery: string;
}): Promise<ReturnType<typeof findCalendarEventForUpdateFromEvents>> {
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  return findCalendarEventForUpdateFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery: params.titleQuery,
    timeZone,
  });
}
