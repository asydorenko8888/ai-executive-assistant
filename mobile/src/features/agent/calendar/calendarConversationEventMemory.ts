import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import {
  augmentEventsWithConversationContext,
  clearPendingTargetInMemory,
  commitCreatedCalendarEvent,
  commitDeletedCalendarEvent,
  commitModifiedCalendarEvent,
  commitReferencedCalendarEvent,
  getCalendarWorkingMemory,
  getConversationPointersForResolution,
  getLastCalendarSnapshot,
  resetCalendarConversationStore,
  resolveExplicitTitleFromMemory,
} from '@/src/features/agent/calendar/calendarConversationStore';
import {
  isCalendarConversationContextFresh,
  touchCalendarConversationContext,
} from '@/src/features/agent/calendar/calendarConversationContext';
import { isIgnorableTitleQueryForMemory, transcriptHasEventPronounReference } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { parseGoogleCalendarRecurringEventId } from '@/src/features/agent/calendar/calendarRecurringEventIds';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { clearPendingIntent, getPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { resetCalendarRefreshAttempts } from '@/src/features/agent/calendar/calendarRefreshAttempts';

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
  recurring?: boolean;
  recurringEventId?: string | null;
};

export type LastReferencedCalendarEvent = {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
  recurringEventId: string | null;
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
export const CONVERSATION_MEMORY_START_TOLERANCE_MS = 30 * 60_000;

let lastReferencedRecurringSeries: ConversationRecurringSeriesRecord | null = null;

function pointerToRecord(
  pointer: {
    eventId: string;
    eventName: string;
    startISO: string;
    endISO: string;
    dateKey: string;
    savedAtMs: number;
    recurring?: boolean;
    recurringEventId?: string | null;
  },
  source: ConversationEventSource,
  activeSource: ActiveCalendarEventSource,
): ConversationEventRecord {
  const recurringInfo = parseGoogleCalendarRecurringEventId(pointer.eventId);

  return {
    eventId: pointer.eventId,
    title: pointer.eventName,
    startISO: pointer.startISO,
    endISO: pointer.endISO,
    dateKey: pointer.dateKey,
    savedAtMs: pointer.savedAtMs,
    source,
    activeSource,
    recurring: pointer.recurring ?? recurringInfo.isRecurringInstance,
    recurringEventId: pointer.recurringEventId ?? (recurringInfo.isRecurringInstance ? recurringInfo.seriesMasterId : null),
  };
}

function buildMemoryView(): CalendarConversationEventMemory {
  const store = getCalendarWorkingMemory();

  return {
    pendingEvent: store.pendingTarget
      ? pointerToRecord(store.pendingTarget, 'pending', 'pending')
      : null,
    lastCreatedEvent: store.lastCreated
      ? pointerToRecord(store.lastCreated, 'create', 'last_created')
      : null,
    lastModifiedEvent: store.lastModified
      ? pointerToRecord(store.lastModified, 'update', 'last_updated')
      : null,
    lastReferencedEvent: store.lastReferenced
      ? pointerToRecord(
          store.lastReferenced,
          store.lastReferenced.eventId === store.lastModified?.eventId
            ? 'update'
            : store.lastReferenced.eventId === store.lastCreated?.eventId
              ? 'create'
              : 'search',
          store.lastReferenced.eventId === store.lastModified?.eventId
            ? 'last_updated'
            : store.lastReferenced.eventId === store.lastCreated?.eventId
              ? 'last_created'
              : 'search',
        )
      : null,
    lastReferencedRecurringSeries,
  };
}

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

export function getActiveCalendarEventRecord(referenceNow: Date): ConversationEventRecord | null {
  return resolveMoveEventReference(referenceNow);
}

export function resolveMoveEventReference(_referenceNow: Date): ConversationEventRecord | null {
  const intent = getPendingIntent();

  if (intent) {
    return {
      eventId: intent.eventId ?? `pending-intent:${intent.intent}`,
      title: intent.title,
      startISO: intent.startISO,
      endISO: intent.endISO,
      dateKey: '',
      savedAtMs: Date.now(),
      source: 'pending',
      activeSource: 'pending',
    };
  }

  return resolveConversationEventReference(_referenceNow);
}

export function resolveDeleteEventReference(_referenceNow: Date): ConversationEventRecord | null {
  const intent = getPendingIntent();

  if (intent?.intent === 'DELETE_EVENT') {
    return resolveConversationEventReference(_referenceNow);
  }

  if (intent?.intent === 'MOVE_EVENT') {
    return resolveConversationEventReference(_referenceNow);
  }

  return resolveConversationEventReference(_referenceNow);
}

export function getLastReferencedCalendarEvent(_referenceNow: Date): LastReferencedCalendarEvent | null {
  const ref = resolveConversationEventReference(_referenceNow);

  if (!ref) {
    return null;
  }

  const series = resolveRecurringSeriesReference(_referenceNow);
  const recurringInfo = parseGoogleCalendarRecurringEventId(ref.eventId);

  return {
    eventId: ref.eventId,
    title: ref.title,
    startTime: ref.startISO,
    endTime: ref.endISO,
    recurring:
      Boolean(ref.recurring) ||
      recurringInfo.isRecurringInstance ||
      Boolean(series && (series.eventId === ref.eventId || series.eventId === recurringInfo.seriesMasterId)),
    recurringEventId:
      ref.recurringEventId ??
      (recurringInfo.isRecurringInstance ? recurringInfo.seriesMasterId : series?.eventId ?? null),
  };
}

export function shouldDeleteFromLastReferencedMemory(params: {
  transcript: string;
  referenceNow: Date;
}) {
  if (!transcriptHasEventPronounReference(params.transcript)) {
    return false;
  }

  const ref = getLastReferencedCalendarEvent(params.referenceNow);

  return Boolean(ref?.eventId && !ref.eventId.startsWith('pending'));
}

export function resolveRecurringSeriesReference(_referenceNow: Date): ConversationRecurringSeriesRecord | null {
  const series = lastReferencedRecurringSeries;

  if (!series || !isCalendarConversationContextFresh()) {
    return null;
  }

  if (Date.now() - series.savedAtMs > CONVERSATION_EVENT_MEMORY_TTL_MS) {
    return null;
  }

  return series;
}

export function getConversationEventMemory() {
  return buildMemoryView();
}

export function resetConversationEventMemory(reason?: string) {
  resetCalendarConversationStore(reason ?? 'memory_reset');
  lastReferencedRecurringSeries = null;
  clearPendingIntent(reason ?? 'memory_reset');
  resetCalendarRefreshAttempts(reason ?? 'memory_reset');
}

export function clearPendingEventInMemory() {
  clearPendingTargetInMemory();
}

export function setPendingEventFromAction(pending: CalendarPendingAction) {
  const originalStart =
    pending.originalStart ??
    pending.updateFromStartISO ??
    (pending.requestedNewStart ?? null);
  const originalEnd =
    pending.originalEnd ??
    pending.updateFromEndISO ??
    (pending.requestedNewEnd ?? null);

  commitReferencedCalendarEvent({
    eventId:
      pending.targetEventId ??
      pending.updateEventId ??
      pending.candidateEventId ??
      `pending:${pending.pendingActionId}`,
    title: pending.targetEventTitle ?? pending.eventTitle,
    startISO:
      originalStart ??
      new Date(pending.requestedStartMs).toISOString(),
    endISO:
      originalEnd ??
      new Date(pending.requestedEndMs).toISOString(),
  });
}

export function recordCreatedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  recurrenceRrule?: string | null;
}) {
  commitCreatedCalendarEvent(params);

  if (params.recurrenceRrule?.trim()) {
    lastReferencedRecurringSeries = {
      eventId: params.eventId,
      title: params.title,
      startISO: params.startISO,
      endISO: params.endISO,
      rrule: params.recurrenceRrule.trim(),
      savedAtMs: Date.now(),
    };
  }
}

export function recordModifiedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  recurring?: boolean;
  recurringEventId?: string | null;
}) {
  commitModifiedCalendarEvent(params);
}

export function recordSearchedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  commitReferencedCalendarEvent(params);
}

export function recordDeletedConversationEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  commitDeletedCalendarEvent(params);
}

export function resolveConversationEventReference(_referenceNow: Date): ConversationEventRecord | null {
  const pointers = getConversationPointersForResolution();

  if (pointers.length === 0) {
    return null;
  }

  const primary = pointers[0];

  if (primary.eventId.startsWith('pending:')) {
    return pointerToRecord(primary, 'pending', 'pending');
  }

  const source =
    primary.eventId === getCalendarWorkingMemory().lastCreated?.eventId
      ? 'create'
      : primary.eventId === getCalendarWorkingMemory().lastModified?.eventId
        ? 'update'
        : 'search';

  return pointerToRecord(
    primary,
    source,
    source === 'create' ? 'last_created' : source === 'update' ? 'last_updated' : 'search',
  );
}

export function resolveConversationEventTitleForReference(
  transcript: string,
  referenceNow: Date,
): string | null {
  const record = resolveConversationEventReference(referenceNow);

  return record?.title ?? null;
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
  const titleQuery = params.titleQuery?.trim() ?? '';
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(titleQuery) ? '' : titleQuery;

  if (effectiveTitleQuery) {
    const augmented = augmentEventsWithConversationContext(
      params.events.map((event) => ({
        ...event,
        isAllDay: false,
      })),
    );
    const titleMatches = params.events.filter((event) =>
      calendarConversationTitlesMatch(effectiveTitleQuery, event.title),
    );

    if (titleMatches.length === 1) {
      return titleMatches[0];
    }

    if (titleMatches.length <= 1) {
      const explicit = resolveExplicitTitleFromMemory(effectiveTitleQuery, augmented);

      if (explicit) {
        return params.events.find((event) => event.id === explicit.id) ?? null;
      }
    }
  }

  const ref = params.reference ?? resolveConversationEventReference(params.referenceNow);

  if (!ref) {
    return null;
  }

  if (
    effectiveTitleQuery &&
    !calendarConversationTitlesMatch(effectiveTitleQuery, ref.title)
  ) {
    return null;
  }

  if (!ref.eventId.startsWith('pending:')) {
    const byId = params.events.find((event) => event.id === ref.eventId);

    if (byId) {
      return byId;
    }
  }

  const refStartMs = Date.parse(ref.startISO);
  const titleMatches = params.events.filter((event) =>
    calendarConversationTitlesMatch(event.title, ref.title),
  );

  if (titleMatches.length === 1) {
    return titleMatches[0];
  }

  if (titleMatches.length === 0) {
    return null;
  }

  if (!Number.isNaN(refStartMs)) {
    const scheduleAligned = titleMatches
      .filter((event) => eventStartMatchesConversationMemory(ref, event))
      .sort(
        (left, right) =>
          Math.abs(Date.parse(left.startsAt) - refStartMs) -
          Math.abs(Date.parse(right.startsAt) - refStartMs),
      );

    if (scheduleAligned.length === 1) {
      return scheduleAligned[0];
    }

    if (scheduleAligned.length > 1) {
      return scheduleAligned[0];
    }
  }

  return titleMatches
    .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt))[0];
}

export { augmentEventsWithConversationContext, getLastCalendarSnapshot };
