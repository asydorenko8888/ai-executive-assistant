import {
  parseCalendarTimeShift,
  stripCalendarTimeShiftPhrases,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';

export type CalendarUpdateTimeShift = ReturnType<typeof parseCalendarTimeShift>;

export { stripCalendarTimeShiftPhrases };

export function parseCalendarUpdateTimeShift(
  transcript: string,
  referenceNow: Date,
): CalendarUpdateTimeShift {
  return parseCalendarTimeShift(transcript, referenceNow);
}

export function stripCalendarUpdateTimeShiftPhrases(transcript: string) {
  return stripCalendarTimeShiftPhrases(transcript);
}
