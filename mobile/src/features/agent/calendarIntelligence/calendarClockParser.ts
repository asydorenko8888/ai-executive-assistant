import { resolveDayOffset } from '@/src/features/agent/calendar/operationalScheduleParser';
import { getZonedTimeParts, zonedLocalToUtcMs } from '@/src/features/agent/calendar/calendarTimezone';
import {
  CALENDAR_CLOCK_PREPOSITION,
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';
import {
  DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
  resolveTargetDayContext,
} from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const CLOCK_PREPOSITION = CALENDAR_CLOCK_PREPOSITION;

export type CalendarClockMatch = {
  fragment: string;
  patternId: string;
  preposition: string | null;
};

export type CalendarTimeShift =
  | {
      ok: true;
      fromMinutes: number;
      toMinutes: number;
      fromMs: number;
      toMs: number;
      hasExplicitDay: boolean;
    }
  | {
      ok: false;
      reason: 'date_parse_failed';
      detail: string;
    };

const CLOCK_FRAGMENT_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  {
    id: 'prep_colon_meridiem',
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(${CLOCK_PREPOSITION})\\s+(\\d{1,2}:\\d{2}\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?)${CALENDAR_WORD_END}`,
      'iu',
    ),
  },
  {
    id: 'prep_split_minutes',
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(${CLOCK_PREPOSITION})\\s+(\\d{1,2})\\s+и\\s+(\\d{2})${CALENDAR_WORD_END}`,
      'iu',
    ),
  },
  {
    id: 'prep_hour_minutes',
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(${CLOCK_PREPOSITION})\\s+(\\d{1,2})(?::(\\d{2}))?${CALENDAR_WORD_END}`,
      'iu',
    ),
  },
  {
    id: 'meridiem_clock',
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью))${CALENDAR_WORD_END}`,
      'iu',
    ),
  },
  {
    id: 'colon_24h',
    pattern: /\b(\d{1,2}:\d{2})\b/,
  },
  {
    id: 'english_meridiem',
    pattern: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\b/i,
  },
];

const FROM_TO_EN =
  /\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}:\d{2})\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}:\d{2})\b/i;

const SHIFT_CLOCK_FRAGMENT =
  '(\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?|\\d{1,2}:\\d{2}|\\d{1,2}\\s+и\\s+\\d{2})';

const FROM_TO_RU = new RegExp(
  `(?:с|з|from)\\s+${SHIFT_CLOCK_FRAGMENT}\\s+(?:на|to|до)\\s+${SHIFT_CLOCK_FRAGMENT}(?:\\s+(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm))?`,
  'iu',
);

function applyRussianMeridiemHint(hours: number, normalizedFragment: string) {
  if (/вечер/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  if (/утр/ui.test(normalizedFragment) && hours === 12) {
    return 0;
  }

  if (/(?:дня|днём|днем)/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  if (/ноч/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  return hours;
}

function parseEnglishMeridiem(hours: number, fragment: string) {
  const normalized = fragment.toLowerCase();

  if (/\bpm\b/i.test(normalized) && hours < 12) {
    return hours + 12;
  }

  if (/\bam\b/i.test(normalized) && hours === 12) {
    return 0;
  }

  return hours;
}

export function normalizeSplitClockFragment(fragment: string) {
  const splitMatch = fragment.trim().match(/^(\d{1,2})\s+и\s+(\d{2})$/iu);

  if (splitMatch) {
    return `${splitMatch[1]}:${splitMatch[2]}`;
  }

  return fragment.trim();
}

export function parseClockFragmentToMinutes(fragment: string, contextText = '') {
  const normalizedFragment = normalizeSplitClockFragment(fragment);
  const meridiemContext = `${normalizedFragment} ${contextText}`.trim().toLowerCase();

  const colonMatch = normalizedFragment.match(/^(\d{1,2}):(\d{2})/);

  if (colonMatch) {
    let hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    hours = applyRussianMeridiemHint(hours, meridiemContext);
    hours = parseEnglishMeridiem(hours, meridiemContext);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }

    return null;
  }

  const bareHourMatch = normalizedFragment.match(/^(\d{1,2})(?:\s|$)/);

  if (bareHourMatch) {
    let hours = Number(bareHourMatch[1]);
    hours = applyRussianMeridiemHint(hours, meridiemContext);
    hours = parseEnglishMeridiem(hours, meridiemContext);

    if (hours >= 0 && hours <= 23) {
      return hours * 60;
    }
  }

  return null;
}

export function extractCalendarClockFragment(transcript: string): CalendarClockMatch | null {
  for (const entry of CLOCK_FRAGMENT_PATTERNS) {
    const match = transcript.match(entry.pattern);

    if (!match) {
      continue;
    }

    if (entry.id === 'prep_split_minutes') {
      return {
        fragment: `${match[2]}:${match[3]}`,
        patternId: entry.id,
        preposition: match[1] ?? null,
      };
    }

    if (entry.id === 'prep_hour_minutes') {
      const minutes = match[3] ? `:${match[3]}` : ':00';

      return {
        fragment: `${match[2]}${minutes}`,
        patternId: entry.id,
        preposition: match[1] ?? null,
      };
    }

    if (entry.id === 'prep_colon_meridiem') {
      return {
        fragment: (match[2] ?? match[0]).trim(),
        patternId: entry.id,
        preposition: match[1] ?? null,
      };
    }

    return {
      fragment: (match[1] ?? match[0]).trim(),
      patternId: entry.id,
      preposition: null,
    };
  }

  return null;
}

export function parseCalendarClockMinutes(
  transcript: string,
  day: CalendarDayContext,
  options: { fragment?: string } = {},
): number | null {
  const fragment = options.fragment ?? extractCalendarClockFragment(transcript)?.fragment;

  if (!fragment) {
    return null;
  }

  return parseClockFragmentToMinutes(fragment, transcript);
}

function zonedMinutesToInstantMs(day: CalendarDayContext, clockMinutes: number) {
  const hour = Math.floor(clockMinutes / 60);
  const minute = clockMinutes % 60;
  const anchor = new Date(day.range.rangeStartMs + 12 * 60 * 60 * 1000);
  const ymd = getZonedTimeParts(anchor, day.timezone);

  return zonedLocalToUtcMs(
    {
      year: ymd.year,
      month: ymd.month,
      day: ymd.day,
      hour,
      minute,
      second: 0,
    },
    day.timezone,
  );
}

function extractShiftClockFragments(transcript: string) {
  const match = transcript.match(FROM_TO_EN) ?? transcript.match(FROM_TO_RU);

  if (!match) {
    return null;
  }

  const trailingMeridiem = transcript.match(
    /(?:на|to|до)\s+\d{1,2}(?::\d{2})?(?:\s+и\s+\d{2})?\s+(вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)/iu,
  );

  const fromFragment = normalizeSplitClockFragment(match[1].trim());
  let toFragment = normalizeSplitClockFragment(match[2].trim());

  if (trailingMeridiem) {
    toFragment = `${toFragment} ${trailingMeridiem[1]}`;
  }

  return { fromFragment, toFragment };
}

export function stripCalendarTimeShiftPhrases(transcript: string) {
  return transcript.replace(FROM_TO_EN, ' ').replace(FROM_TO_RU, ' ').replace(/\s+/g, ' ').trim();
}

export function stripCalendarClockPhrases(transcript: string) {
  let text = transcript;

  for (const entry of CLOCK_FRAGMENT_PATTERNS) {
    text = text.replace(entry.pattern, ' ');
  }

  return text.replace(/\s+/g, ' ').trim();
}

export function parseCalendarTimeShift(
  transcript: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): CalendarTimeShift {
  const fragments = extractShiftClockFragments(transcript);

  if (!fragments) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'Could not parse from/to time shift (expected e.g. from 7 PM to 8 PM)',
    };
  }

  const dayOffset = resolveDayOffset(transcript);
  const hasExplicitDay = dayOffset !== null;
  const day = resolveTargetDayContext(transcript, referenceNow, timeZone);

  if (dayOffset !== null && day.dayOffset !== dayOffset) {
    // resolveTargetDayContext already handles explicit day offsets.
  }

  let fromMinutes = parseClockFragmentToMinutes(fragments.fromFragment, transcript);
  let toMinutes = parseClockFragmentToMinutes(fragments.toFragment, transcript);

  if (
    fromMinutes !== null &&
    toMinutes !== null &&
    /вечер/ui.test(fragments.toFragment) &&
    !/вечер|утр|дн|ноч|am|pm/i.test(fragments.fromFragment) &&
    fromMinutes < 12 * 60 &&
    toMinutes >= 12 * 60
  ) {
    fromMinutes += 12 * 60;
  }

  if (fromMinutes === null || toMinutes === null) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'Could not parse from/to clock times',
    };
  }

  return {
    ok: true,
    fromMinutes,
    toMinutes,
    fromMs: zonedMinutesToInstantMs(day, fromMinutes),
    toMs: zonedMinutesToInstantMs(day, toMinutes),
    hasExplicitDay,
  };
}

export function asksAboutEventsAtClock(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || !extractCalendarClockFragment(normalized)) {
    return false;
  }

  if (/\b(?:what is|what's|how many|at|@)\b/i.test(normalized)) {
    return true;
  }

  if (
    /(?:какая|какие|какую|какое|какой|что|що|сколько|скільки|задач|событи|поді|встреч|зустріч|event|task|meeting|стоит(?!\s+ли)|запланирован|запланован|календар)/iu.test(
      normalized,
    )
  ) {
    return true;
  }

  return new RegExp(`${CALENDAR_WORD_EDGE}${CLOCK_PREPOSITION}\\s*\\d`, 'iu').test(normalized);
}
