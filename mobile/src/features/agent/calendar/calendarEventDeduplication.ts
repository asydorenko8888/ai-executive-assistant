import type { CalendarEvent } from '@/src/entities/calendar/types';
import { sortEventsChronologically } from '@/src/features/agent/calendar/calendarSchedule';

export type CalendarEventScheduleIdentity = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  dateKey: string;
};

function normalizeTitleKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fallback identity when the same real-world event appears under multiple local ids. */
export function buildCalendarEventScheduleKey(
  event: Pick<CalendarEvent, 'title' | 'startsAt' | 'endsAt'>,
) {
  return `${normalizeTitleKey(event.title)}|${event.startsAt}|${event.endsAt}`;
}

function eventIdPreferenceScore(eventId: string) {
  if (eventId.startsWith('pending-intent:')) {
    return 0;
  }

  if (eventId.startsWith('pending:')) {
    return 1;
  }

  return 10;
}

function pickPreferredCalendarEvent(events: CalendarEvent[]) {
  return [...events].sort((left, right) => eventIdPreferenceScore(right.id) - eventIdPreferenceScore(left.id))[0]!;
}

/**
 * Deduplicate by Google event id, then collapse identical title+start+end copies.
 */
export function deduplicateCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();

  for (const event of events) {
    byId.set(event.id, event);
  }

  const idUnique = [...byId.values()];
  const bySchedule = new Map<string, CalendarEvent[]>();

  for (const event of idUnique) {
    const key = buildCalendarEventScheduleKey(event);
    const bucket = bySchedule.get(key) ?? [];
    bucket.push(event);
    bySchedule.set(key, bucket);
  }

  return sortEventsChronologically(
    [...bySchedule.values()].map((bucket) => pickPreferredCalendarEvent(bucket)),
  );
}

export function collapseCalendarEventCandidates<T extends CalendarEvent>(events: T[]): T[] {
  const deduped = deduplicateCalendarEvents(events);

  return deduped as T[];
}

export function toCurrentActiveCalendarEvent(
  event: Pick<CalendarEvent, 'id' | 'title' | 'startsAt' | 'endsAt'>,
  dateKey: string,
): CalendarEventScheduleIdentity {
  return {
    eventId: event.id,
    title: event.title.trim(),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dateKey,
  };
}

export function logCalendarEventDeduplication(payload: {
  stage: string;
  rawCount: number;
  localStoredCount?: number;
  deduplicatedCount: number;
  matchedBeforeDedupe?: number;
  matchedAfterDedupe?: number;
  selectedEventId?: string | null;
  apiSuccess?: boolean | null;
}) {
  console.log('[CALENDAR EVENT DEDUPE]');
  console.log(
    JSON.stringify({
      stage: payload.stage,
      rawFetchedCount: payload.rawCount,
      localStoredCount: payload.localStoredCount ?? null,
      deduplicatedCount: payload.deduplicatedCount,
      matchedBeforeDedupe: payload.matchedBeforeDedupe ?? null,
      matchedAfterDedupe: payload.matchedAfterDedupe ?? null,
      selectedEventId: payload.selectedEventId ?? null,
      googleCalendarApiSuccess: payload.apiSuccess ?? null,
    }),
  );
}
