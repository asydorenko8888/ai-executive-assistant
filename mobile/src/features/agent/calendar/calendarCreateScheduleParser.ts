import { applyCalendarCreatePastTimeGuard } from '@/src/features/agent/calendar/calendarCreatePastTimeGuard';
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  applyRecurrenceToCreateSchedule,
  parseCalendarCreateScheduleWithRecurrence,
  type ParsedCalendarRecurrence,
} from '@/src/features/agent/calendar/calendarCreateRecurrenceParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export type CalendarCreateScheduleResult =
  | {
      ok: true;
      startMs: number;
      endMs: number;
      hasExplicitTime: true;
      explicitDayOffset: number;
      recurrence?: ParsedCalendarRecurrence;
    }
  | {
      ok: false;
      reason: 'date_parse_failed' | 'past_time_needs_clarification';
      detail: string;
    };

export function parseCalendarCreateSchedule(
  transcript: string,
  referenceNow: Date,
  timeZone = getExecutiveCalendarTimezone(),
  locale?: CalendarConflictLocale,
): CalendarCreateScheduleResult {
  const { recurrence, scheduleText, pointSchedule } = parseCalendarCreateScheduleWithRecurrence(
    transcript,
    referenceNow,
    timeZone,
  );

  if (!pointSchedule.ok) {
    return pointSchedule;
  }

  const schedule = recurrence
    ? applyRecurrenceToCreateSchedule({
        schedule: pointSchedule,
        recurrence,
        referenceNow,
        timeZone,
      })
    : pointSchedule;

  const guarded = applyCalendarCreatePastTimeGuard({
    transcript: scheduleText,
    referenceNow,
    schedule,
    timeZone,
    locale,
  });

  if (!guarded.ok) {
    return guarded;
  }

  return recurrence ? { ...guarded, recurrence } : guarded;
}
