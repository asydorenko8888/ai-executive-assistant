import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { logUpdateParsedRequest } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import {
  augmentEventsWithConversationContext,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getActiveCalendarEvent,
  resolveMutationSearchDayOffset,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import { resolveEventTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  resolveCalendarUpdateIntent,
  type CalendarUpdateResolvedIntent,
} from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import {
  parseCalendarUpdateSchedule,
  stripCalendarUpdateSchedulePhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { UPDATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarUpdateVerbs';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  logCalendarMutationCandidates,
  logCalendarMutationFreshRead,
  logCalendarMutationSelection,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
import { findCalendarEventForDeleteFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

export async function findCalendarEventForDelete(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const extractedTitle = extractDeleteEventTitle(params.transcript);
  const memoryRef = getActiveCalendarEvent(params.referenceNow);
  const titleQuery = resolveEventTitleQueryForMemory({
    extractedTitle,
    memoryTitle: memoryRef?.title ?? null,
  });
  const timeZone = getExecutiveCalendarTimezone();
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    timeZone,
  });
  const { events, range, fetchOk } = await fetchCalendarEventsForZonedDay(
    params.referenceNow,
    searchDayOffset,
  );

  logCalendarMutationFreshRead({
    dayOffset: searchDayOffset,
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    fetchOk,
    eventCount: events.length,
  });

  if (!fetchOk) {
    return {
      match: null,
      candidates: [],
      titleQuery,
      targetMs: null,
      fetchOk: false,
      notFoundReason: null as null,
    };
  }

  const resolved = findCalendarEventForDeleteFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery,
    timeZone,
  });

  logCalendarMutationCandidates({
    count: resolved.candidates.length,
    candidates: resolved.candidates.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    })),
  });

  logCalendarMutationSelection({
    eventId: resolved.match?.id ?? null,
    title: resolved.match?.title ?? (titleQuery || null),
    startsAt: resolved.match?.startsAt ?? null,
    endsAt: resolved.match?.endsAt ?? null,
    selectionSource: resolved.match ? 'google_calendar_list' : 'none',
  });

  return {
    match: resolved.match,
    candidates: resolved.candidates,
    titleQuery,
    targetMs: resolved.match?.startsAt ? Date.parse(resolved.match.startsAt) : null,
    fetchOk: true,
    notFoundReason: resolved.notFoundReason,
  };
}

export type CalendarUpdateMatchResult = {
  match: import('@/src/entities/calendar/types').CalendarEvent | null;
  candidates: import('@/src/entities/calendar/types').CalendarEvent[];
  titleQuery: string;
  requestedEventName: string | null;
  targetMs: number | null;
  toMs: number | null;
  fetchOk: boolean;
  ambiguous: boolean;
  resolutionFailureReason:
    | 'no_event_name'
    | 'not_found'
    | 'ambiguous'
    | 'time_parse_failed'
    | 'no_time_change'
    | null;
  resolutionDetail: string | null;
  resolvedIntent: Extract<CalendarUpdateResolvedIntent, { ok: true }> | null;
};

/**
 * Resolves calendar update targets: event by name first, then requested time.
 * Never substitutes the target with another event at the destination clock time.
 */
export async function findCalendarEventForUpdate(params: {
  transcript: string;
  referenceNow: Date;
}): Promise<CalendarUpdateMatchResult> {
  const extractedTitle = extractUpdateEventTitle(params.transcript);
  const memoryRef = getActiveCalendarEvent(params.referenceNow) ?? resolveMoveEventReference(params.referenceNow);
  const titleQuery = resolveEventTitleQueryForMemory({
    extractedTitle,
    memoryTitle: memoryRef?.title,
  });
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow);
  const timeZone = getExecutiveCalendarTimezone();
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    schedule,
    timeZone,
  });
  const { events, range, fetchOk } = await fetchCalendarEventsForZonedDay(
    params.referenceNow,
    searchDayOffset,
  );

  logUpdateParsedRequest({
    transcript: params.transcript,
    titleSource: stripCalendarUpdateSchedulePhrases(
      params.transcript.replace(UPDATE_COMMAND_PREFIX, ''),
    ),
    titleQuery,
    fromMs: 0,
    toMs: 0,
    fromTimeLabel: 'n/a',
    toTimeLabel: 'n/a',
  });

  logCalendarMutationFreshRead({
    dayOffset: searchDayOffset,
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    fetchOk,
    eventCount: events.length,
  });

  if (!fetchOk) {
    return {
      match: null,
      candidates: [],
      titleQuery,
      requestedEventName: titleQuery || null,
      targetMs: null,
      toMs: null,
      fetchOk: false,
      ambiguous: false,
      resolutionFailureReason: null,
      resolutionDetail: null,
      resolvedIntent: null,
    };
  }

  const eventsForResolution = augmentEventsWithConversationContext(events);

  const resolved = resolveCalendarUpdateIntent({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events: eventsForResolution,
    timeZone,
  });

  logCalendarMutationCandidates({
    count: resolved.ok ? 1 : resolved.candidates.length,
    candidates: (resolved.ok ? [resolved.target] : resolved.candidates).map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    })),
  });

  if (!resolved.ok) {
    logCalendarMutationSelection({
      eventId: resolved.target?.id ?? null,
      title: resolved.target?.title ?? resolved.requestedEventName,
      startsAt: resolved.target?.startsAt ?? null,
      endsAt: resolved.target?.endsAt ?? null,
      selectionSource: 'none',
    });

    return {
      match: resolved.target ?? null,
      candidates: resolved.candidates,
      titleQuery,
      requestedEventName: resolved.requestedEventName,
      targetMs: resolved.target ? Date.parse(resolved.target.startsAt) : null,
      toMs: null,
      fetchOk: true,
      ambiguous: resolved.reason === 'ambiguous',
      resolutionFailureReason: resolved.reason,
      resolutionDetail: resolved.detail,
      resolvedIntent: null,
    };
  }

  logCalendarMutationSelection({
    eventId: resolved.target.id,
    title: resolved.target.title,
    startsAt: resolved.target.startsAt,
    endsAt: resolved.target.endsAt,
    selectionSource: 'google_calendar_list',
  });

  return {
    match: resolved.target,
    candidates: resolved.candidates,
    titleQuery,
    requestedEventName: resolved.requestedEventName,
    targetMs: resolved.originalStartMs,
    toMs: resolved.requestedStartMs,
    fetchOk: true,
    ambiguous: false,
    resolutionFailureReason: null,
    resolutionDetail: null,
    resolvedIntent: resolved,
  };
}
