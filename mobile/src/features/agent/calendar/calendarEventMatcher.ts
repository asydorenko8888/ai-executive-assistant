/**
 * @deprecated Delete matching is disabled until calendarEventResolver is wired for delete-by-id.
 * Use resolveCalendarEventCandidates from calendarEventResolver.ts for read-only resolution.
 */
import { resolveCalendarEventCandidates } from '@/src/features/agent/calendar/calendarEventResolver';
import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import { stripCalendarUpdateTimeShiftPhrases } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';

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
  const titleSource = stripCalendarUpdateTimeShiftPhrases(
    params.transcript.replace(UPDATE_COMMAND_PREFIX, ''),
  );
  const titleQuery = extractCalendarEventTitle(titleSource, params.referenceNow);

  const resolved = await resolveCalendarEventCandidates({
    titleQuery,
    targetMs: params.fromMs,
    referenceNow: params.referenceNow,
  });

  return {
    match: resolved.match,
    candidates: resolved.candidates.map((entry) => entry.event),
    titleQuery,
    targetMs: params.fromMs,
  };
}
