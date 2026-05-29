import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { logUpdateParsedRequest } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  parseCalendarUpdateSchedule,
  stripCalendarUpdateSchedulePhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { UPDATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarUpdateVerbs';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

export async function findCalendarEventForDelete(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const titleQuery = extractDeleteEventTitle(params.transcript) ?? '';
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  const resolved = findCalendarEventForDeleteFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery,
    timeZone,
  });

  return {
    match: resolved.match,
    candidates: resolved.candidates,
    titleQuery,
    targetMs: resolved.match?.startsAt ? Date.parse(resolved.match.startsAt) : null,
    notFoundReason: resolved.notFoundReason,
  };
}

export async function findCalendarEventForUpdate(params: {
  transcript: string;
  referenceNow: Date;
  fromMs?: number;
}) {
  const titleQuery = extractUpdateEventTitle(params.transcript) ?? '';
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow);
  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const searchDayOffset =
    schedule.ok && (schedule.kind === 'destination' || schedule.kind === 'relative_offset')
      ? 0
      : day.dayOffset;
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, searchDayOffset);

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
      schedule.ok && schedule.kind !== 'relative_offset'
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

  const resolved = findCalendarEventForUpdateFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery,
    timeZone,
  });

  if (resolved.match) {
    return {
      match: resolved.match,
      candidates: resolved.candidates,
      titleQuery,
      targetMs: resolved.fromMs ?? params.fromMs ?? null,
      toMs: resolved.toMs,
    };
  }

  return {
    match: null,
    candidates: resolved.candidates,
    titleQuery,
    targetMs: resolved.fromMs ?? params.fromMs ?? null,
    toMs: resolved.toMs,
  };
}
