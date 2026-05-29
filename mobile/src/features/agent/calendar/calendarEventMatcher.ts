/**
 * @deprecated Delete matching is disabled until calendarEventResolver is wired for delete-by-id.
 * Use resolveCalendarEventCandidates from calendarEventResolver.ts for read-only resolution.
 */
import { resolveCalendarEventCandidates } from '@/src/features/agent/calendar/calendarEventResolver';
import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';

const DELETE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]+|$)/iu;

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
