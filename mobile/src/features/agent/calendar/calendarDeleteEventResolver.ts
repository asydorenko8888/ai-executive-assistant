import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import {
  logDeleteCandidate,
  logDeleteEventList,
  logDeleteNotFoundReason,
  logDeleteParsedRequest,
  logDeleteSelectedEvent,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import {
  resolveCalendarDeleteTargetFromEvents,
  type CalendarDeleteResolution,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

export type { CalendarDeleteResolution } from '@/src/features/agent/calendar/calendarDeleteResolution';
export {
  isRecurringGoogleCalendarEventId,
  resolveCalendarDeleteTargetFromEvents,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
export { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';

export async function resolveCalendarDeleteTarget(params: {
  transcript: string;
  referenceNow: Date;
}): Promise<CalendarDeleteResolution> {
  const titleQuery = extractDeleteEventTitle(params.transcript) ?? '';
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const clockMinutes = parseCalendarClockMinutes(params.transcript, day);

  logDeleteParsedRequest({
    transcript: params.transcript,
    titleQuery,
    hasExplicitTime: clockMinutes !== null,
    clockMinutes,
  });

  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  logDeleteEventList({
    count: events.length,
    eventIds: events.map((event) => event.id),
  });

  const resolution = resolveCalendarDeleteTargetFromEvents({
    events,
    titleQuery,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    timeZone,
  });

  if (resolution.status === 'not_found' && resolution.notFoundReason) {
    logDeleteNotFoundReason({
      reason: resolution.notFoundReason,
      titleQuery,
      clockMinutes,
      candidateCount: resolution.candidates.length,
    });
  }

  logDeleteCandidate({
    count: resolution.candidates.length,
    candidates: resolution.candidates.map((entry) => ({
      id: entry.event.id,
      title: entry.event.title,
      startsAt: entry.event.startsAt,
    })),
  });

  logDeleteSelectedEvent(
    resolution.status === 'unique'
      ? {
          id: resolution.event.id,
          title: resolution.event.title,
          startsAt: resolution.event.startsAt,
        }
      : null,
  );

  return resolution;
}
