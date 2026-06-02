import { applyCalendarCreatePastTimeGuard } from '@/src/features/agent/calendar/calendarCreatePastTimeGuard';
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { parseCalendarPointSchedule } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

export type CalendarCreateScheduleResult =
  | {
      ok: true;
      startMs: number;
      endMs: number;
      hasExplicitTime: true;
      explicitDayOffset: number;
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
  const parsed = parseCalendarPointSchedule(transcript, referenceNow, timeZone);

  if (!parsed.ok) {
    return parsed;
  }

  return applyCalendarCreatePastTimeGuard({
    transcript,
    referenceNow,
    schedule: parsed,
    timeZone,
    locale,
  });
}
