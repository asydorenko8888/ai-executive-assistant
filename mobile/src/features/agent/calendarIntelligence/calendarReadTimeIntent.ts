import { detectCalendarCreateByTitleTimePattern } from '@/src/features/agent/calendar/calendarCreateByTitleTime';
import {
  asksAboutEventsAtClock,
  extractCalendarClockFragment,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_CLOCK_PREPOSITION,
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

export type CalendarReadTimeKind = 'event_at_time' | 'event_starting_at_time';

const EXPLICIT_WRITE_VERB_AT_START = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:please\\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй|удали|удалить|видали|видалити|перенеси|перенести|измени|зміни|add|create|schedule|book|put|insert|delete|remove|cancel|update|move|reschedule|shift)${CALENDAR_WORD_END}`,
  'iu',
);

const UPDATE_SHIFT_WITH_VERB =
  /(?:перенеси|перенести|перенос|измени|зміни|move|reschedule|update|shift).{0,80}(?:с|з|from)\s+\d/i;

/** Collapse whitespace and strip trailing punctuation before classification. */
export function normalizeCalendarReadTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ').replace(/[?!.,…]+$/u, '').trim();
}

/** Lowercase + day-word normalization for semantic intent rules. */
export function normalizeCalendarReadSemantics(transcript: string) {
  return normalizeCalendarReadTranscript(transcript)
    .toLowerCase()
    .replace(/\bсегодня\b/giu, 'сегодня')
    .replace(/\bсьогодні\b/giu, 'сьогодні')
    .replace(/\bзавтра\b/giu, 'завтра')
    .replace(/\btoday\b/giu, 'today')
    .replace(/\btomorrow\b/giu, 'tomorrow');
}

const EVENT_STARTING_AT_MARKERS = [
  /(?:начина(?:ется|еться|ются)|starts?)/iu,
  /(?:что|що)\s+(?:запланирован[оа]?|запланован[оа]?)/iu,
  new RegExp(`${CALENDAR_WORD_EDGE}(?:запланирован[оа]?|запланован[оа]?)${CALENDAR_WORD_END}`, 'iu'),
  new RegExp(`${CALENDAR_WORD_EDGE}(?:назначен[оа]?|призначен[оа]?)${CALENDAR_WORD_END}`, 'iu'),
  new RegExp(`${CALENDAR_WORD_EDGE}стоит(?!\\s+ли)${CALENDAR_WORD_END}`, 'iu'),
  new RegExp(
    `${CALENDAR_WORD_EDGE}(?:какая|какой|какую|яка|який)${CALENDAR_WORD_END}.{0,24}(?:задач|встреч|зустріч|meeting|task)`,
    'iu',
  ),
  new RegExp(
    `(?:задач|встреч|зустріч|meeting|task).{0,40}(?:${CALENDAR_CLOCK_PREPOSITION})\\s*\\d{1,2}`,
    'iu',
  ),
  new RegExp(
    `(?:${CALENDAR_CLOCK_PREPOSITION})\\s*\\d{1,2}.{0,24}(?:запланирован|запланован|назначен|назначена)`,
    'iu',
  ),
];

const EVENT_ACTIVE_AT_MARKERS = [
  /(?:что|що)\s+(?:у\s+меня|у\s+мене|происходит|творится|відбува)/iu,
  /(?:какие|які)\s+(?:событ|событи|events?|подій)/iu,
  /\bwhat(?:'s|\s+is|\s+do\s+i\s+have|\s+happens?\s+at)\b/i,
  /\bwhat\s+is\s+at\b/i,
  /\bhow\s+many\s+events?\s+at\b/i,
];

function hasStartingAtMarker(normalized: string) {
  return EVENT_STARTING_AT_MARKERS.some((pattern) => pattern.test(normalized));
}

function hasActiveAtMarker(normalized: string) {
  return EVENT_ACTIVE_AT_MARKERS.some((pattern) => pattern.test(normalized));
}

export function classifyCalendarReadTimeKind(transcript: string): CalendarReadTimeKind | null {
  const normalized = normalizeCalendarReadSemantics(transcript);

  if (!normalized || !extractCalendarClockFragment(normalized)) {
    return null;
  }

  if (new RegExp(`${CALENDAR_WORD_EDGE}стоит\\s+ли${CALENDAR_WORD_END}`, 'iu').test(normalized)) {
    return null;
  }

  if (EXPLICIT_WRITE_VERB_AT_START.test(normalized) || UPDATE_SHIFT_WITH_VERB.test(normalized)) {
    return null;
  }

  const starting = hasStartingAtMarker(normalized);
  const active = hasActiveAtMarker(normalized);

  if (starting && active) {
    if (/(?:какие|які)\s+(?:событ|событи|events?|подій)/iu.test(normalized)) {
      return 'event_at_time';
    }

    if (/(?:что|що)\s+(?:у\s+меня|у\s+мене|происходит)/iu.test(normalized)) {
      return 'event_at_time';
    }

    return 'event_starting_at_time';
  }

  if (starting && !active) {
    return 'event_starting_at_time';
  }

  if (active && !starting) {
    return 'event_at_time';
  }

  if (asksAboutEventsAtClock(normalized)) {
    return 'event_at_time';
  }

  return null;
}

export function isCalendarReadBlockedByWriteIntent(transcript: string) {
  const normalized = normalizeCalendarReadSemantics(transcript);

  return (
    EXPLICIT_WRITE_VERB_AT_START.test(normalized) ||
    UPDATE_SHIFT_WITH_VERB.test(normalized) ||
    detectCalendarCreateByTitleTimePattern(normalized) !== null
  );
}

export function isCalendarClockReadQuery(transcript: string) {
  return classifyCalendarReadTimeKind(transcript) !== null;
}

export function calendarReadTimeKindToQueryIntent(
  kind: CalendarReadTimeKind,
): 'events_at_time' | 'events_starting_at_time' {
  return kind === 'event_starting_at_time' ? 'events_starting_at_time' : 'events_at_time';
}
