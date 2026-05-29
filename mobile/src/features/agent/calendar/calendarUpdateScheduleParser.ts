import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';
import { resolveDayOffset } from '@/src/features/agent/calendar/operationalScheduleParser';

export type CalendarUpdateTimeShift =
  | {
      ok: true;
      fromMs: number;
      toMs: number;
      hasExplicitDay: boolean;
    }
  | {
      ok: false;
      reason: 'date_parse_failed';
      detail: string;
    };

const FROM_TO_EN =
  /\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}:\d{2})\b\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}:\d{2})\b/i;

const FROM_TO_RU =
  /\b(?:с|from)\s+(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?|\d{1,2}:\d{2})\b\s+(?:на|to|до)\s+(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?|\d{1,2}:\d{2})\b/iu;

export function stripCalendarUpdateTimeShiftPhrases(transcript: string) {
  return transcript.replace(FROM_TO_EN, ' ').replace(FROM_TO_RU, ' ').replace(/\s+/g, ' ').trim();
}

function parseClockOnDay(clockFragment: string, transcript: string, base: Date, hasExplicitDay: boolean) {
  const clockParseInput = /вечер|утр|дн[её]м|ноч|am|pm/i.test(clockFragment)
    ? clockFragment
    : `${clockFragment} ${transcript}`;

  const parsedTime = parseSpokenClockTime(clockParseInput, base, {
    rollToNextDayIfPast: !hasExplicitDay,
  });

  if (!parsedTime) {
    return null;
  }

  if (hasExplicitDay) {
    parsedTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
  }

  return parsedTime;
}

export function parseCalendarUpdateTimeShift(
  transcript: string,
  referenceNow: Date,
): CalendarUpdateTimeShift {
  const match = transcript.match(FROM_TO_EN) ?? transcript.match(FROM_TO_RU);

  if (!match?.[1] || !match[2]) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'Could not parse from/to time shift (expected e.g. from 7 PM to 8 PM)',
    };
  }

  const dayOffset = resolveDayOffset(transcript);
  const hasExplicitDay = dayOffset !== null;
  const base = new Date(referenceNow);

  if (dayOffset !== null) {
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + dayOffset);
  }

  const fromDate = parseClockOnDay(match[1].trim(), transcript, base, hasExplicitDay);
  const toDate = parseClockOnDay(match[2].trim(), transcript, base, hasExplicitDay);

  if (!fromDate || !toDate) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'Could not parse from/to clock times',
    };
  }

  return {
    ok: true,
    fromMs: fromDate.getTime(),
    toMs: toDate.getTime(),
    hasExplicitDay,
  };
}
