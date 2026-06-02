import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import {
  isCalendarConversationContextFresh,
  touchCalendarConversationContext,
} from '@/src/features/agent/calendar/calendarConversationContext';
import { isIgnorableTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { calendarEventFromMemoryRecord } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { clearPendingIntent, getPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { titlesReferToSameEvent } from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { getExecutiveCalendarTimezone, getZonedYmd } from '@/src/features/agent/calendar/calendarTimezone';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';

export type ConversationEventSource = 'create' | 'update' | 'delete' | 'search' | 'pending';

export type ActiveCalendarEventSource =
  | 'last_created'
  | 'last_updated'
  | 'last_deleted'
  | 'pending'
  | 'search';

export type ConversationEventRecord = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  dateKey: string;
  savedAtMs: number;
  source: ConversationEventSource;
  activeSource: ActiveCalendarEventSource;
};

export type ConversationRecurringSeriesRecord = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  rrule: string;
  savedAtMs: number;
};

export type CalendarConversationEventMemory = {
  pendingEvent: ConversationEventRecord | null;
  lastCreatedEvent: ConversationEventRecord | null;
  lastModifiedEvent: ConversationEventRecord | null;
  lastReferencedEvent: ConversationEventRecord | null;
  lastReferencedRecurringSeries: ConversationRecurringSeriesRecord | null;
};

export const CONVERSATION_EVENT_MEMORY_TTL_MS = 30 * 60 * 1000;

/** Allowed drift between memory start and calendar event start (same conversational target). */
export const CONVERSATION_MEMORY_START_TOLERANCE_MS = 30 * 60_000;

export function getConversationMemoryForMoveValidation(
  referenceNow: Date,
): ConversationEventRecord | null {
  return resolveMoveEventReference(referenceNow);
}

export function eventStartMatchesConversationMemory(
  memoryRef: ConversationEventRecord,
  event: { startsAt: string },
  toleranceMs = CONVERSATION_MEMORY_START_TOLERANCE_MS,
) {
  const refStartMs = Date.parse(memoryRef.startISO);
  const eventStartMs = Date.parse(event.startsAt);

  if (Number.isNaN(refStartMs) || Number.isNaN(eventStartMs)) {
    return true;
  }

  return Math.abs(eventStartMs - refStartMs) <= toleranceMs;
}

const EMPTY_MEMORY: CalendarConversationEventMemory = {
  pendingEvent: null,
  lastCreatedEvent: null,
  lastModifiedEvent: null,
  lastReferencedEvent: null,
  lastReferencedRecurringSeries: null,
};

let memory: CalendarConversationEventMemory = { ...EMPTY_MEMORY };

function isPendingPlaceholderEventId(eventId: string) {
  return eventId.startsWith('pending:');
}

function mapActiveSource(source: ConversationEventSource): ActiveCalendarEventSource {
  if (source === 'create') {
    return 'last_created';
  }

  if (source === 'update') {
    return 'last_updated';
  }

  if (source === 'delete') {
    return 'last_deleted';
  }

  if (source === 'pending') {
    return 'pending';
  }

  return 'search';
}

function buildRecord(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  source: ConversationEventSource;
  activeSource?: ActiveCalendarEventSource;
}): ConversationEventRecord {
  const timeZone = getExecutiveCalendarTimezone();
  const ymd = getZonedYmd(new Date(params.startISO), timeZone);

  return {
    eventId: params.eventId,
    title: params.title.trim(),
    startISO: params.startISO,
    endISO: params.endISO,
    dateKey: formatDateKey(ymd),
    savedAtMs: Date.now(),
    source: params.source,
    activeSource: params.activeSource ?? mapActiveSource(params.source),
  };
}

function isRecordFresh(record: ConversationEventRecord) {
  return (
    isCalendarConversationContextFresh() &&
    Date.now() - record.savedAtMs <= CONVERSATION_EVENT_MEMORY_TTL_MS
  );
}

function pendingIntentToRecord(intent: NonNullable<ReturnType<typeof getPendingIntent>>): ConversationEventRecord {
  return buildRecord({
    eventId: intent.eventId ?? `pending-intent:${intent.intent}`,
    title: intent.title,
    startISO: intent.startISO,
    endISO: intent.endISO,
    source: 'pending',
    activeSource: 'pending',
  });
}

export function getActiveCalendarEventRecord(referenceNow: Date): ConversationEventRecord | null {
  return resolveMoveEventReference(referenceNow);
}

/**
 * MOVE resolution: pendingIntent → pendingEvent → lastReferenced → lastModified → lastCreated.
 */
export function resolveMoveEventReference(_referenceNow: Date): ConversationEventRecord | null {
  const intent = getPendingIntent();

  if (intent) {
    return pendingIntentToRecord(intent);
  }

  return resolveConversationEventReference(_referenceNow);
}

export function resolveRecurringSeriesReference(_referenceNow: Date): ConversationRecurringSeriesRecord | null {
  const series = memory.lastReferencedRecurringSeries;

  if (!series || !isCalendarConversationContextFresh()) {
    return null;
  }

  if (Date.now() - series.savedAtMs > CONVERSATION_EVENT_MEMORY_TTL_MS) {
    return null;
  }

  return series;
}

function touchReferenced(record: ConversationEventRecord) {
  touchCalendarConversationContext();
  memory = {
    ...memory,
    lastReferencedEvent: { ...record, savedAtMs: Date.now() },
  };
}

export function getConversationEventMemory() {
  return memory;
}

export function resetConversationEventMemory(reason?: string) {
  memory = { ...EMPTY_MEMORY };
  clearPendingIntent(reason ?? 'memory_reset');

  console.log('[CONVERSATION EVENT MEMORY RESET]');
  if (reason) {
    console.log(`reason=${reason}`);
  }
}

export function clearPendingEventInMemory() {
  if (!memory.pendingEvent) {
    return;
  }

  memory = { ...memory, pendingEvent: null };
  console.log('[CONVERSATION EVENT MEMORY] pendingEvent cleared');
}

export function setPendingEventFromAction(pending: CalendarPendingAction) {
  const record = buildRecord({
    eventId:
      pending.updateEventId ??
      pending.candidateEventId ??
      `pending:${pending.pendingActionId}`,
    title: pending.eventTitle,
    startISO: new Date(pending.requestedStartMs).toISOString(),
    endISO: new Date(pending.requestedEndMs).toISOString(),
    source: 'pending',
  });

  touchCalendarConversationContext();
  memory = { ...memory, pendingEvent: record };
  touchReferenced(record);

  console.log('[CONVERSATION EVENT MEMORY] pendingEvent set');
  console.log(JSON.stringify({ title: record.title, eventId: record.eventId }));
}

export function recordCreatedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  recurrenceRrule?: string | null;
}) {
  const record = buildRecord({ ...params, source: 'create' });
  const series =
    params.recurrenceRrule?.trim()
      ? {
          eventId: params.eventId,
          title: params.title,
          startISO: params.startISO,
          endISO: params.endISO,
          rrule: params.recurrenceRrule.trim(),
          savedAtMs: Date.now(),
        }
      : null;

  touchCalendarConversationContext();
  memory = {
    ...memory,
    pendingEvent: null,
    lastCreatedEvent: record,
    lastReferencedEvent: record,
    lastReferencedRecurringSeries: series,
  };

  console.log('[CONVERSATION EVENT MEMORY] lastCreatedEvent + lastReferencedEvent');
  console.log(
    JSON.stringify({
      eventId: record.eventId,
      title: record.title,
      recurring: Boolean(series),
    }),
  );
}

export function recordModifiedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const record = buildRecord({ ...params, source: 'update' });

  touchCalendarConversationContext();
  memory = {
    ...memory,
    pendingEvent: null,
    lastModifiedEvent: record,
    lastReferencedEvent: record,
  };

  console.log('[CONVERSATION EVENT MEMORY] lastModifiedEvent + lastReferencedEvent');
  console.log(JSON.stringify({ eventId: record.eventId, title: record.title }));
}

export function recordSearchedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const record = buildRecord({ ...params, source: 'search' });
  touchReferenced(record);

  console.log('[CONVERSATION EVENT MEMORY] lastReferencedEvent from search');
  console.log(JSON.stringify({ eventId: record.eventId, title: record.title }));
}

export function recordDeletedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const record = buildRecord({ ...params, source: 'delete' });
  touchReferenced(record);

  console.log('[CONVERSATION EVENT MEMORY] lastReferencedEvent from delete');
  console.log(JSON.stringify({ eventId: record.eventId, title: record.title }));
}

/**
 * Resolution priority: pendingEvent → lastReferencedEvent → lastModifiedEvent → lastCreatedEvent
 */
export function resolveConversationEventReference(referenceNow: Date): ConversationEventRecord | null {
  const candidates = [
    memory.pendingEvent,
    memory.lastReferencedEvent,
    memory.lastModifiedEvent,
    memory.lastCreatedEvent,
  ];

  for (const record of candidates) {
    if (record && isRecordFresh(record)) {
      return record;
    }
  }

  return null;
}

export function resolveConversationEventTitleForReference(
  transcript: string,
  referenceNow: Date,
): string | null {
  const record = resolveConversationEventReference(referenceNow);

  if (!record) {
    return null;
  }

  const normalized = transcript.trim();

  if (!normalized) {
    return record.title;
  }

  if (titlesReferToSameEvent(normalized, record.title)) {
    return record.title;
  }

  return record.title;
}

export function findMoveConversationEventInList<T extends {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}>(params: {
  events: T[];
  referenceNow: Date;
  titleQuery?: string;
}): T | null {
  return findConversationEventInList({
    ...params,
    reference: resolveMoveEventReference(params.referenceNow),
  });
}

export function findConversationEventInList<T extends { id: string; title: string; startsAt: string; endsAt: string }>(
  params: {
  events: T[];
  referenceNow: Date;
  titleQuery?: string;
  reference?: ConversationEventRecord | null;
},
): T | null {
  const ref = params.reference ?? resolveConversationEventReference(params.referenceNow);

  if (!ref) {
    return null;
  }

  const titleQuery = params.titleQuery?.trim() ?? '';
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(titleQuery) ? '' : titleQuery;

  if (
    effectiveTitleQuery &&
    !calendarConversationTitlesMatch(effectiveTitleQuery, ref.title)
  ) {
    return null;
  }

  if (!isPendingPlaceholderEventId(ref.eventId)) {
    const byId = params.events.find((event) => event.id === ref.eventId);

    if (byId && eventStartMatchesConversationMemory(ref, byId)) {
      return byId;
    }

    if (isRecordFresh(ref)) {
      return calendarEventFromMemoryRecord(ref) as unknown as T;
    }
  }

  const refStartMs = Date.parse(ref.startISO);
  const titleMatches = params.events
    .map((event) => {
      if (calendarConversationTitlesMatch(event.title, ref.title)) {
        return { event, score: 100 };
      }

      const eventKey = event.title.toLowerCase();
      const titleKey = ref.title.toLowerCase();

      if (eventKey.includes(titleKey) || titleKey.includes(eventKey)) {
        return { event, score: 80 };
      }

      return { event, score: 0 };
    })
    .filter((entry) => entry.score > 0);

  const scheduleAligned = titleMatches.filter((entry) =>
    eventStartMatchesConversationMemory(ref, entry.event),
  );

  if (scheduleAligned.length === 0) {
    return null;
  }

  if (scheduleAligned.length === 1) {
    return scheduleAligned[0].event;
  }

  if (!Number.isNaN(refStartMs)) {
    return scheduleAligned
      .map((entry) => entry.event)
      .sort(
        (left, right) =>
          Math.abs(Date.parse(left.startsAt) - refStartMs) -
          Math.abs(Date.parse(right.startsAt) - refStartMs),
      )[0];
  }

  return scheduleAligned
    .map((entry) => entry.event)
    .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt))[0];
}
