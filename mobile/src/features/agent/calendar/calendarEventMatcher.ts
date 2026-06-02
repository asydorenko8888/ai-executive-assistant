import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { logUpdateParsedRequest } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getActiveCalendarEvent,
  resolveMutationSearchDayOffset,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import { resolveEventTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
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
import {
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

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

export async function findCalendarEventForUpdate(params: {
  transcript: string;
  referenceNow: Date;
  fromMs?: number;
}) {
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

  const formatClock = (minutes: number) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  };

  logUpdateParsedRequest({
    transcript: params.transcript,
    titleSource: stripCalendarUpdateSchedulePhrases(
      params.transcript.replace(UPDATE_COMMAND_PREFIX, ''),
    ),
    titleQuery,
    fromMs:
      schedule.ok && schedule.kind === 'from_to'
        ? schedule.fromMs
        : params.fromMs ?? 0,
    toMs:
      schedule.ok && (schedule.kind === 'from_to' || schedule.kind === 'destination')
        ? schedule.toMs
        : 0,
    fromTimeLabel:
      schedule.ok && schedule.kind === 'from_to' ? formatClock(schedule.fromMinutes) : 'unknown',
    toTimeLabel:
      schedule.ok && schedule.kind === 'from_to'
        ? formatClock(schedule.toMinutes)
        : schedule.ok && schedule.kind === 'destination'
          ? formatClock(schedule.toMinutes)
          : 'unknown',
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
      targetMs: params.fromMs ?? null,
      toMs: null,
      fetchOk: false,
      ambiguous: false,
    };
  }

  const resolved = findCalendarEventForUpdateFromEvents({
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

  if (resolved.match) {
    return {
      match: resolved.match,
      candidates: resolved.candidates,
      titleQuery,
      targetMs: resolved.fromMs ?? params.fromMs ?? null,
      toMs: resolved.toMs,
      fetchOk: true,
      ambiguous: false,
    };
  }

  return {
    match: null,
    candidates: resolved.candidates,
    titleQuery,
    targetMs: resolved.fromMs ?? params.fromMs ?? null,
    toMs: resolved.toMs,
    fetchOk: true,
    ambiguous: resolved.ambiguous,
  };
}
