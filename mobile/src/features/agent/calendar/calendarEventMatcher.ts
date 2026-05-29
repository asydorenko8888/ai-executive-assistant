import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { logUpdateParsedRequest } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  parseCalendarUpdateTimeShift,
  stripCalendarUpdateTimeShiftPhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const UPDATE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:move|reschedule|update|shift|перенеси|перенести|перенес(?:ь|ьте)|перенос|измени|зміни)(?:[\s,:-]+|$)/iu;

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
  fromMs: number;
}) {
  const titleQuery = extractUpdateEventTitle(params.transcript) ?? '';
  const shift = parseCalendarUpdateTimeShift(params.transcript, params.referenceNow);

  const formatClock = (minutes: number) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  };

  const fromTimeLabel = shift.ok ? formatClock(shift.fromMinutes) : formatClock(params.fromMs / 60_000);
  const toTimeLabel = shift.ok ? formatClock(shift.toMinutes) : 'unknown';

  logUpdateParsedRequest({
    transcript: params.transcript,
    titleSource: stripCalendarUpdateTimeShiftPhrases(
      params.transcript.replace(UPDATE_COMMAND_PREFIX, ''),
    ),
    titleQuery,
    fromMs: shift.ok ? shift.fromMs : params.fromMs,
    toMs: shift.ok ? shift.toMs : params.fromMs,
    fromTimeLabel,
    toTimeLabel,
  });

  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, day.dayOffset);

  const resolved = findCalendarEventForUpdateFromEvents({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    events,
    titleQuery,
  });

  if (resolved.match) {
    return {
      match: resolved.match,
      candidates: resolved.candidates,
      titleQuery,
      targetMs: resolved.fromMs ?? params.fromMs,
    };
  }

  return {
    match: null,
    candidates: resolved.candidates,
    titleQuery,
    targetMs: resolved.fromMs ?? params.fromMs,
  };
}
