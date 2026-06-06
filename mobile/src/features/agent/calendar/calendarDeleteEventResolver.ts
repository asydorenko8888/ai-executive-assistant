import { fetchCalendarEventsForMutationSearch } from '@/src/features/agent/calendar/calendarMutationEventSearch';
import {
  logDeleteCandidate,
  logDeleteNotFoundReason,
  logDeleteParsedRequest,
  logDeleteSelectedEvent,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import {
  resolveCalendarDeleteTargetFromEvents,
  type CalendarDeleteResolution,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { augmentEventsWithConversationContext } from '@/src/features/agent/calendar/calendarConversationStore';
import {
  deduplicateCalendarEvents,
  logCalendarEventDeduplication,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  getActiveCalendarEvent,
  resolveMutationSearchDayOffset,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import { resolveEventTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import {
  logCalendarMutationCandidates,
  logCalendarMutationFreshRead,
  logCalendarMutationSelection,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
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
  const extractedTitle = extractDeleteEventTitle(params.transcript);
  const memoryRef = getActiveCalendarEvent(params.referenceNow);
  const titleQuery = resolveEventTitleQueryForMemory({
    extractedTitle,
    memoryTitle: memoryRef?.title ?? null,
  }) ?? '';
  const timeZone = getExecutiveCalendarTimezone();
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    timeZone,
  });
  const clockMinutes = parseCalendarClockMinutes(
    params.transcript,
    resolveTargetDayContext(params.transcript, params.referenceNow, timeZone),
  );

  logDeleteParsedRequest({
    transcript: params.transcript,
    titleQuery,
    hasExplicitTime: clockMinutes !== null,
    clockMinutes,
  });

  const { events, fetchOk, timeMin, timeMax } = await fetchCalendarEventsForMutationSearch({
    referenceNow: params.referenceNow,
    transcript: params.transcript,
    memoryRef,
  });

  logCalendarMutationFreshRead({
    dayOffset: searchDayOffset,
    timeMin,
    timeMax,
    fetchOk,
    eventCount: events.length,
  });

  if (!fetchOk) {
    return {
      status: 'fetch_failed',
      titleQuery,
      targetMs: null,
      candidates: [],
      notFoundReason: null,
    };
  }

  const augmentedEvents = augmentEventsWithConversationContext(events);
  const dedupedEvents = deduplicateCalendarEvents(augmentedEvents);

  logCalendarEventDeduplication({
    stage: 'delete_resolution_fetch',
    rawCount: events.length,
    localStoredCount: augmentedEvents.length,
    deduplicatedCount: dedupedEvents.length,
  });

  logCalendarMutationCandidates({
    count: dedupedEvents.length,
    candidates: dedupedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    })),
  });

  const resolution = resolveCalendarDeleteTargetFromEvents({
    events: dedupedEvents,
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

  logCalendarMutationSelection({
    eventId: resolution.status === 'unique' ? resolution.event.id : null,
    title: resolution.status === 'unique' ? resolution.event.title : titleQuery || null,
    startsAt: resolution.status === 'unique' ? resolution.event.startsAt : null,
    endsAt: resolution.status === 'unique' ? resolution.event.endsAt : null,
    selectionSource: resolution.status === 'unique' ? 'google_calendar_list' : 'none',
  });

  return resolution;
}
