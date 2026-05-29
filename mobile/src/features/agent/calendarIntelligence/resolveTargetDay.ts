import { formatDateKey, zonedDateKeyFromInstant } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import {
  addDaysToZonedYmd,
  getZonedDayRange,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
export const DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE = 'America/Chicago';

const TOMORROW_DAY_PATTERNS = [
  new RegExp(`${CALENDAR_WORD_EDGE}(?:завтра|tomorrow)${CALENDAR_WORD_END}`, 'iu'),
  /\bзадач[аи]?\s+на\s+завтра/i,
  /\bplans?\s+for\s+tomorrow\b/i,
];

const TODAY_DAY_PATTERNS = [
  new RegExp(`${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today)${CALENDAR_WORD_END}`, 'iu'),
  /\bplans?\s+for\s+today\b/i,
];

function resolveDayOffsetFromTranscript(transcript: string): number | null {
  const normalized = transcript.trim();

  if (TOMORROW_DAY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 1;
  }

  if (TODAY_DAY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 0;
  }

  return null;
}
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

function resolveWeekdayDayOffset(transcript: string, referenceNow: Date, timeZone: string) {
  const normalized = transcript.toLowerCase();
  const weekdayMatch = normalized.match(
    /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/i,
  );

  if (!weekdayMatch) {
    return null;
  }

  const weekdayIndex: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    воскрес: 0,
    понедельник: 1,
    вторник: 2,
    сред: 3,
    четверг: 4,
    пятниц: 5,
    суббот: 6,
  };

  const key = Object.keys(weekdayIndex).find((candidate) =>
    weekdayMatch[1].toLowerCase().startsWith(candidate),
  );

  if (!key) {
    return null;
  }

  const target = weekdayIndex[key];
  const anchorYmd = getZonedYmd(referenceNow, timeZone);
  const anchorUtc = zonedLocalToUtcMs(anchorYmd, timeZone);
  const anchorWeekday = new Date(anchorUtc).getUTCDay();
  let delta = (target - anchorWeekday + 7) % 7;

  if (delta === 0 && !/\b(?:today|сьогодні|сегодня)\b/i.test(normalized)) {
    delta = 7;
  }

  return delta;
}

function resolveExplicitIsoDayOffset(transcript: string, referenceNow: Date, timeZone: string) {
  const isoDateMatch = transcript.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);

  if (!isoDateMatch) {
    return null;
  }

  const explicitKey = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  const anchorYmd = getZonedYmd(referenceNow, timeZone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = addDaysToZonedYmd(anchorYmd, offset);

    if (formatDateKey(candidate) === explicitKey) {
      return offset;
    }
  }

  return null;
}

export function resolveTargetDayContext(
  transcript: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): CalendarDayContext {
  const agendaOffset = resolveDayOffsetFromTranscript(transcript);
  const weekdayOffset = resolveWeekdayDayOffset(transcript, referenceNow, timeZone);
  const explicitOffset = resolveExplicitIsoDayOffset(transcript, referenceNow, timeZone);

  const dayOffset = agendaOffset ?? weekdayOffset ?? explicitOffset ?? 0;
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);

  return {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };
}

export function resolveTargetDayContextForInstant(
  instantIso: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): CalendarDayContext | null {
  const dateKey = zonedDateKeyFromInstant(instantIso, timeZone);

  if (!dateKey) {
    return null;
  }

  const anchorYmd = getZonedYmd(referenceNow, timeZone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = addDaysToZonedYmd(anchorYmd, offset);

    if (formatDateKey(candidate) === dateKey) {
      const range = getZonedDayRange(referenceNow, offset, timeZone);

      return {
        dateKey,
        dayOffset: offset,
        range,
        timezone: timeZone,
      };
    }
  }

  return null;
}
