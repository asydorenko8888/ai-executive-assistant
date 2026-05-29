import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { CalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/types';

const LIST_DAY_PATTERNS = [
  /\bfull\s+list\b/i,
  /\ball\s+tasks?\b/i,
  /\bplans?\s+for\s+(?:today|tomorrow)\b/i,
  /\b(?:today|tomorrow)(?:'s)?\s+plans?\b/i,
  /\bagenda\b/i,
  /\b(?:сьогодні|сегодня|today)\b/i,
  /\b(?:завтра|tomorrow)\b/i,
  /\b(?:які|which|what).{0,24}(?:задачі|tasks?|events?|meetings?)/i,
  /\b(?:какие|які|what|which|сколько|скільки).{0,32}(?:задач|tasks?|events?|meetings?)/i,
];

function isListDayQuery(transcript: string) {
  const normalized = transcript.trim();

  return LIST_DAY_PATTERNS.some((pattern) => pattern.test(normalized));
}

const AT_TIME_PATTERNS = [
  /\b(?:at|@|в|на|о)\s+\d/i,
  /\b\d{1,2}\s*(?:am|pm)\b/i,
  /\b\d{1,2}:\d{2}\b/,
  /\b(?:в|на)\s+\d{1,2}/iu,
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

  return classifyCalendarQueryIntent(normalized) !== null;
}

export function classifyCalendarQueryIntent(transcript: string): CalendarQueryIntent {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  console.log('[Calendar Query Intent]', { transcript: normalized });

  if (COUNT_AT_TIME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'count_at_time';
  }

  const asksEventsAtClock =
    AT_TIME_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    /\b(?:what is|what's|что|що|скільки|сколько|how many|at|@|в|на|о)\b/i.test(normalized);

  if (asksEventsAtClock && !/\b(?:full list|all tasks|agenda|plans?\s+for)\b/i.test(normalized)) {
    return 'events_at_time';
  }

  if (COMBINE_ACTIVITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'combine_activity';
  }

  if (FREE_SLOT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return /\b(?:best|оптимальн|лучш)/i.test(normalized) ? 'best_slot' : 'free_windows';
  }

  if (NEXT_EVENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'next_event';
  }

  if (LAST_EVENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'last_event';
  }

  if (OVERLAP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'overlaps';
  }

  if (isListDayQuery(normalized)) {
    return 'list_day';
  }

  return null;
}
