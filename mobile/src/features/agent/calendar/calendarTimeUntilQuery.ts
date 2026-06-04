import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  filterUpcomingTimedEvents,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { normalizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitleNormalization';
import {
  scoreTitleMatchForMutation,
  selectBestEventByTitlePriority,
} from '@/src/features/agent/calendar/calendarTitleMatchPriority';

const TIME_UNTIL_PATTERNS: Array<{ pattern: RegExp; group: number }> = [
  {
    pattern:
      /(?:сколько|скільки)\s+(?:у\s+меня\s+|у\s+мене\s+)?(?:времени|время|часу|час|осталось|залишилось)\s+до\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:сколько|скільки)\s+осталось\s+до\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:через\s+сколько|за\s+скільки)\s+(.+)/iu,
    group: 1,
  },
  {
    pattern: /(?:how\s+long\s+until|how\s+much\s+time\s+(?:is\s+)?left\s+until|time\s+until)\s+(.+)/iu,
    group: 1,
  },
];

export function isCalendarTimeUntilEventQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return TIME_UNTIL_PATTERNS.some(({ pattern }) => pattern.test(normalized));
}

export function extractTimeUntilEventTitleQuery(transcript: string) {
  const normalized = transcript.trim();

  for (const { pattern, group } of TIME_UNTIL_PATTERNS) {
    const match = normalized.match(pattern);

    if (!match?.[group]) {
      continue;
    }

    const raw = match[group]
      .trim()
      .replace(/[?.!,;:]+$/u, '')
      .trim();

    if (!raw) {
      continue;
    }

    return normalizeCalendarEventTitle(raw);
  }

  return null;
}

export function resolveTimeUntilTargetEvent(params: {
  transcript: string;
  events: CalendarEvent[];
  referenceNow: Date;
}): CalendarEvent | null {
  const titleQuery = extractTimeUntilEventTitleQuery(params.transcript);

  if (!titleQuery) {
    return null;
  }

  const upcoming = filterUpcomingTimedEvents(
    sortEventsChronologically(params.events),
    params.referenceNow,
  );

  const matching = upcoming.filter(
    (event) => scoreTitleMatchForMutation(titleQuery, event.title).tier !== 'none',
  );

  if (matching.length === 0) {
    return null;
  }

  if (matching.length === 1) {
    return matching[0] ?? null;
  }

  const ranked = matching
    .map((event) => ({
      event,
      startMs: parseGoogleCalendarInstant(event.startsAt) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.startMs - right.startMs);

  const nearest = ranked[0]?.event ?? null;

  if (!nearest) {
    return null;
  }

  const selection = selectBestEventByTitlePriority(matching, titleQuery);

  if (selection.ambiguous) {
    return nearest;
  }

  return selection.match ?? nearest;
}
