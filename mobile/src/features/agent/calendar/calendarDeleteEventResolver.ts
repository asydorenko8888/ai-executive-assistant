import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import {
  resolveCalendarDeleteTargetFromEvents,
  type CalendarDeleteResolution,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
import { loadEventsForResolution } from '@/src/features/agent/calendar/calendarEventResolver';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';

const DELETE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]+|$)/iu;

export type { CalendarDeleteResolution } from '@/src/features/agent/calendar/calendarDeleteResolution';
export {
  isRecurringGoogleCalendarEventId,
  resolveCalendarDeleteTargetFromEvents,
} from '@/src/features/agent/calendar/calendarDeleteResolution';

export async function resolveCalendarDeleteTarget(params: {
  transcript: string;
  referenceNow: Date;
}): Promise<CalendarDeleteResolution> {
  const titleSource = params.transcript.replace(DELETE_COMMAND_PREFIX, '');
  const titleQuery = extractCalendarEventTitle(titleSource, params.referenceNow);
  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);
  const targetMs = schedule.ok ? schedule.date.getTime() : null;
  const hasExplicitTime = schedule.ok ? schedule.hasExplicitTime : false;
  const dayOffset =
    schedule.ok && schedule.explicitDayOffset !== null ? schedule.explicitDayOffset : undefined;

  const events = await loadEventsForResolution({
    referenceNow: params.referenceNow,
    dayOffset,
  });

  const resolution = resolveCalendarDeleteTargetFromEvents({
    events,
    titleQuery,
    targetMs,
    hasExplicitTime,
  });

  logCalendarCreate('delete resolution', {
    status: resolution.status,
    titleQuery,
    targetMs,
    candidateCount: resolution.candidates.length,
    eventId: resolution.status === 'unique' ? resolution.event.id : null,
  });

  return resolution;
}
