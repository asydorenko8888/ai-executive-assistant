/**
 * @deprecated Delete matching is disabled until calendarEventResolver is wired for delete-by-id.
 * Use resolveCalendarEventCandidates from calendarEventResolver.ts for read-only resolution.
 */
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import { logUpdateParsedRequest } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import {
  parseCalendarUpdateTimeShift,
  stripCalendarUpdateTimeShiftPhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { resolveCalendarEventCandidates } from '@/src/features/agent/calendar/calendarEventResolver';

const DELETE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]+|$)/iu;

const UPDATE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:move|reschedule|update|shift|перенеси|перенести|перенес(?:ь|ьте)|перенос|измени|зміни)(?:[\s,:-]+|$)/iu;

export async function findCalendarEventForDelete(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const titleQuery = extractCalendarEventTitle(
    params.transcript.replace(DELETE_COMMAND_PREFIX, ''),
    params.referenceNow,
  );
  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);
  const targetMs = schedule.ok ? schedule.date.getTime() : null;

  const resolved = await resolveCalendarEventCandidates({
    titleQuery,
    targetMs,
    referenceNow: params.referenceNow,
  });

  return {
    match: resolved.match,
    candidates: resolved.candidates.map((entry) => entry.event),
    titleQuery,
    targetMs,
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
