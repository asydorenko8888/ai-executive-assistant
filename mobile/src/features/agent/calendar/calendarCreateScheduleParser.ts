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
      reason: 'date_parse_failed';
      detail: string;
    };

export function parseCalendarCreateSchedule(
  transcript: string,
  referenceNow: Date,
  timeZone = getExecutiveCalendarTimezone(),
): CalendarCreateScheduleResult {
  const parsed = parseCalendarPointSchedule(transcript, referenceNow, timeZone);

  if (!parsed.ok) {
    return parsed;
  }

  return parsed;
}
