import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  asksAboutEventsAtClock,
  extractCalendarClockFragment,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_CLOCK_PREPOSITION,
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { logIntentClassified } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import {
  calendarReadTimeKindToQueryIntent,
  classifyCalendarReadTimeKind,
  normalizeCalendarReadSemantics,
} from '@/src/features/agent/calendarIntelligence/calendarReadTimeIntent';
import type { CalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/types';

const CLOCK_PREPOSITION = CALENDAR_CLOCK_PREPOSITION;

const LIST_DAY_PATTERNS = [
  /\bfull\s+list\b/i,
  /\ball\s+tasks?\b/i,
  /\bplans?\s+for\s+(?:today|tomorrow)\b/i,
  /\b(?:today|tomorrow)(?:'s)?\s+plans?\b/i,
  /\bagenda\b/i,
  new RegExp(`${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today)${CALENDAR_WORD_END}`, 'iu'),
  new RegExp(`${CALENDAR_WORD_EDGE}(?:завтра|tomorrow)${CALENDAR_WORD_END}`, 'iu'),
  /\b(?:які|which|what).{0,24}(?:задачі|tasks?|events?|meetings?)/i,
  /(?:какие|какая|які|what|which|сколько|скільки).{0,32}(?:задач|tasks?|events?|meetings?)/iu,
];

function isListDayQuery(transcript: string) {
  const normalized = transcript.trim();

  return LIST_DAY_PATTERNS.some((pattern) => pattern.test(normalized));
}

const AT_TIME_PATTERNS = [
  new RegExp(`${CALENDAR_WORD_EDGE}${CLOCK_PREPOSITION}\\s+\\d`, 'iu'),
  /\b\d{1,2}\s*(?:am|pm)\b/i,
  /\b\d{1,2}:\d{2}\b/,
  new RegExp(`${CALENDAR_WORD_EDGE}${CLOCK_PREPOSITION}\\s+\\d{1,2}`, 'iu'),
  /\b(?:о|в)\s+семь/i,
  /\b7\s*pm\b/i,
  /\b19:?\d{0,2}\b/,
];

const COUNT_AT_TIME_PATTERNS = [
  /\b(?:how many|сколько|скільки).{0,40}(?:at|@|в|на|о)\s*\d/i,
  /\b(?:how many|сколько|скільки).{0,40}\d{1,2}\s*(?:am|pm)/i,
  /\b(?:сколько|скільки)\s+(?:задач|events?|meetings?|подій)/i,
];

const NEXT_EVENT_PATTERNS = [
  /\b(?:next|upcoming|наступн|ближайш|следующ).{0,24}(?:task|event|meeting|задач|поді|встреч|зустріч)/i,
  /\bwhat(?:'s| is)\s+next\b/i,
  /\bчто\s+дальше\b/i,
  /\bщо\s+далі\b/i,
];

const LAST_EVENT_PATTERNS = [
  /\b(?:last|final|остал|останн|последн).{0,24}(?:task|event|meeting|задач|поді|встреч|зустріч)/i,
];

const FREE_SLOT_PATTERNS = [
  /\b(?:find|slot|window|вікно|окно|время|час).{0,40}(?:free|вільн|свобод)/i,
  /\b(?:free|вільн|свободн).{0,40}(?:hour|час|годин|minute|мин)/i,
  /\bfind\s+(?:me\s+)?\d/i,
  /\b(?:1|one)\s+hour\b/i,
  /\bworkout|тренуван|тренировк|gym\b/i,
];

const COMBINE_ACTIVITY_PATTERNS = [
  /\bcombine\b/i,
  /\bfit\s+(?:workout|gym)/i,
  /\bworkout.{0,40}(?:meeting|зустріч|встреч)/i,
  /\b(?:тренуван|тренировк).{0,40}(?:зустріч|встреч|meeting)/i,
];

const OVERLAP_PATTERNS = [
  /\boverlap/i,
  /\bконфлікт/i,
  /\bконфликт/i,
  /\bпересеч/i,
  /\bdouble[- ]book/i,
];

export function isDeterministicCalendarReadQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isOperationalCalendarWriteRequest(normalized)) {
    return false;
  }

  if (isCalendarExactTimeReadQuery(normalized)) {
    return true;
  }

  return classifyCalendarQueryIntent(normalized) !== null;
}

export function classifyCalendarQueryIntent(transcript: string): CalendarQueryIntent {
  const normalized = normalizeCalendarReadSemantics(transcript);

  if (!normalized) {
    return null;
  }

  let intent: CalendarQueryIntent = null;

  if (COUNT_AT_TIME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    intent = 'count_at_time';
  } else {
    const readTimeKind = classifyCalendarReadTimeKind(transcript);

    if (readTimeKind) {
      intent = calendarReadTimeKindToQueryIntent(readTimeKind);
    } else if (isCalendarExactTimeReadQuery(transcript)) {
      intent = 'events_starting_at_time';
    } else {
      const hasClock = extractCalendarClockFragment(normalized) !== null;
      const asksEventsAtClock =
        (AT_TIME_PATTERNS.some((pattern) => pattern.test(normalized)) || hasClock) &&
        asksAboutEventsAtClock(normalized);

      if (asksEventsAtClock && !/\b(?:full list|all tasks|agenda|plans?\s+for)\b/i.test(normalized)) {
        intent = 'events_at_time';
      } else if (COMBINE_ACTIVITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
        intent = 'combine_activity';
      } else if (FREE_SLOT_PATTERNS.some((pattern) => pattern.test(normalized))) {
        intent = /\b(?:best|оптимальн|лучш)/i.test(normalized) ? 'best_slot' : 'free_windows';
      } else if (NEXT_EVENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
        intent = 'next_event';
      } else if (LAST_EVENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
        intent = 'last_event';
      } else if (OVERLAP_PATTERNS.some((pattern) => pattern.test(normalized))) {
        intent = 'overlaps';
      } else if (isListDayQuery(normalized)) {
        intent = 'list_day';
      }
    }
  }

  logIntentClassified({
    transcript,
    normalizedTranscript: normalized,
    readTimeKind: classifyCalendarReadTimeKind(transcript),
    calendarIntent: intent,
  });

  return intent;
}
