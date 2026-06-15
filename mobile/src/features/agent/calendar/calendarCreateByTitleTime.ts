import { containsWeatherDomainKeywords } from '@/src/features/weather/weatherDomainKeywords';
import { isCalendarFreeTimeTodayQuery } from '@/src/features/agent/calendar/calendarFreeTimeQuery';
import { isCalendarQueryOrFindIntent } from '@/src/features/agent/calendar/calendarQueryIntent';
import { isTemporalOnlyTitle } from '@/src/features/agent/calendar/calendarTemporalWords';
import { hasSpokenTimeHint, parseSpokenTimeFragment } from '@/src/features/agent/calendar/calendarSpokenTime';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
const BLOCKED_DELETE_START =
  /^(?:please\s+)?(?:удали|удалить|видали|видалити|скасуй|delete|remove|cancel)\b/iu;

const BLOCKED_UPDATE_START =
  /^(?:please\s+)?(?:перенеси|перенести|move|reschedule|update|измени|зміни)\b/iu;

export type CalendarCreateByTitleTimeMatch = {
  titlePart: string;
  timePart: string;
  patternId: string;
};

const DAY_COUNT_DURATION =
  /(?:ближайш(?:ие|их|ие)?|найближч(?:і|их)?|next)\s*(?:\d+|5)\s*(?:дн(?:ей|я|ів|ні)|days?)/iu;

const QUESTION_START = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:какая|какой|какую|какое|какие|что|що|яка|який|які|which|what|when|когда|коли)${CALENDAR_WORD_END}`,
  'iu',
);

const TITLE_TIME_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  {
    id: 'title_today_time',
    pattern:
      /^(?<title>.+?)\s+(?:сегодня|сьогодні|сегодня)\s+(?:на|в|о)\s+(?<time>.+)$/iu,
  },
  {
    id: 'title_tomorrow_time',
    pattern: /^(?<title>.+?)\s+(?:завтра|tomorrow)\s+(?:на|в|о|at)\s+(?<time>.+)$/iu,
  },
  {
    id: 'title_tomorrow_at',
    pattern: /^(?<title>.+?)\s+tomorrow\s+at\s+(?<time>.+)$/iu,
  },
  {
    id: 'title_prep_time',
    pattern: /^(?<title>.+?)\s+(?:на|в|о)\s+(?<time>.+)$/iu,
  },
  {
    id: 'title_time_meridiem',
    pattern:
      /^(?<title>.+?)\s+(?<time>\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|am|pm)?)$/iu,
  },
  {
    id: 'title_spoken_evening',
    pattern:
      /^(?<title>.+?)\s+(?<time>(?:в|на|о)\s+)?(?:\d{1,2}|один|два|две|три|четыре|четверо|чотири|пять|шесть|семь|сім|восемь|вісім|девять|десять|одиннадцать|двенадцать|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:вечера|вечером|вечора|увечері)$/iu,
  },
];

export function hasSchedulableTimeHint(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (isExplicitDurationOnly(normalized)) {
    return false;
  }

  return (
    extractCalendarClockFragment(normalized) !== null ||
    hasSpokenTimeHint(normalized) ||
    parseSpokenTimeFragment(normalized) !== null ||
    /\b(?:today|tomorrow|завтра|сьогодні|сегодня|\d{1,2}:\d{2})\b/iu.test(normalized)
  );
}

function isExplicitDurationOnly(transcript: string) {
  return /(?:^|[\s,.;:!?—-]+)(?:на|for)\s+\d+(?:[.,]\d+)?\s*(?:час(?:а|ов|у)?|годин(?:и|у|ы)?|hours?|hrs?)(?:[,.!\s]|$)/iu.test(
    transcript.trim(),
  );
}

export function detectCalendarCreateByTitleTimePattern(
  transcript: string,
): CalendarCreateByTitleTimeMatch | null {
  const normalized = transcript.trim();

  if (
    !normalized ||
    containsWeatherDomainKeywords(normalized) ||
    isCalendarFreeTimeTodayQuery(normalized) ||
    isCalendarQueryOrFindIntent(normalized) ||
    QUESTION_START.test(normalized) ||
    BLOCKED_DELETE_START.test(normalized) ||
    BLOCKED_UPDATE_START.test(normalized)
  ) {
    return null;
  }

  for (const entry of TITLE_TIME_PATTERNS) {
    const match = normalized.match(entry.pattern);

    if (!match?.groups?.title || !match?.groups?.time) {
      continue;
    }

    const titlePart = match.groups.title.trim();
    const timePart = match.groups.time.trim();

    if (DAY_COUNT_DURATION.test(timePart) || DAY_COUNT_DURATION.test(normalized)) {
      continue;
    }

    if (titlePart.length < 2 || isTemporalOnlyTitle(titlePart) || QUESTION_START.test(titlePart)) {
      continue;
    }

    const schedulableContext = `${normalized} ${timePart}`;

    if (!hasSchedulableTimeHint(schedulableContext)) {
      continue;
    }

    console.log('[CREATE INTENT BY TITLE_TIME_PATTERN]');
    console.log(
      JSON.stringify({
        patternId: entry.id,
        titlePart,
        timePart,
        transcriptPreview: normalized.slice(0, 120),
      }),
    );

    return {
      titlePart,
      timePart,
      patternId: entry.id,
    };
  }

  return null;
}

export function isCalendarCreateByTitleTimePattern(transcript: string) {
  return detectCalendarCreateByTitleTimePattern(transcript) !== null;
}
