import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
function createPendingActionId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function logPendingStateCreated(pending: CalendarPendingAction) {
  console.log('[PENDING STATE CREATED]');
  console.log(
    JSON.stringify({
      pendingActionId: pending.pendingActionId,
      actionType: pending.actionType,
      originalIntentPreview: pending.originalIntent.slice(0, 120),
      candidateEventId: pending.candidateEventId,
      proposedStart: pending.requestedTimeIso,
      proposedEnd: new Date(pending.requestedEndMs).toISOString(),
      conflictEvents: pending.conflictEvents.map((event) => event.title),
      createdAt: new Date(pending.createdAtMs).toISOString(),
    }),
  );
}
import {
  deduplicateCalendarEvents,
  logCalendarEventDeduplication,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  getLiveCalendarEvents,
  mergeCalendarEventLists,
  replaceLiveCalendarEvents,
} from '@/src/features/agent/calendar/calendarLiveState';
import { getExecutiveCalendarTimezone, getZonedYmd } from '@/src/features/agent/calendar/calendarTimezone';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  isCalendarConversationContextFresh,
  touchCalendarConversationContext,
} from '@/src/features/agent/calendar/calendarConversationContext';

export type CalendarConversationState =
  | 'IDLE'
  | 'EXECUTING_OPERATION'
  | 'SYNCING_CALENDAR'
  | 'AWAITING_CONFLICT_CONFIRMATION'
  | 'AWAITING_EVENT_SELECTION'
  | 'WAITING_ALTERNATIVE_SLOT'
  | 'WAITING_NEW_TIME'
  | 'WAITING_DELETE_CONFIRMATION'
  | 'WAITING_MOVE_CONFIRMATION'
  /** @deprecated Use AWAITING_CONFLICT_CONFIRMATION — kept for tests and legacy callers */
  | 'WAITING_CONFLICT_RESOLUTION'
  | 'WAITING_CONFLICT_DECISION'
  | 'WAITING_CONFLICT_CONFIRMATION'
  | 'WAITING_ALTERNATIVE_SELECTION'
  | 'WAITING_EVENT_SELECTION'
  | 'WAITING_EVENT_CONFIRMATION';

export type CalendarPendingActionType = 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT';
export type CalendarPendingActionKind = 'create' | 'update' | 'delete';

export type CalendarPendingConflictEvent = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
};

export type CalendarPendingAction = {
  pendingActionId: string;
  actionType: CalendarPendingActionKind;
  originalIntent: string;
  candidateEventId: string | null;
  proposedStartMs: number;
  proposedEndMs: number;
  conflictEvents: CalendarPendingConflictEvent[];
  createdAtMs: number;
  action: CalendarPendingActionType;
  eventTitle: string;
  sourceTranscript: string;
  titleSourceTranscript: string | null;
  languageCode: VoiceLanguageCode;
  requestedStartMs: number;
  requestedEndMs: number;
  requestedTimeIso: string;
  updateEventId?: string | null;
  conflictingEventId?: string | null;
  conflictingTitle?: string | null;
  conflictingEventTitle?: string | null;
  conflictingStartsAt?: string | null;
  conflictingEndsAt?: string | null;
  targetEventId?: string | null;
  targetEventTitle?: string | null;
  originalStart?: string | null;
  originalEnd?: string | null;
  requestedNewStart?: string | null;
  requestedNewEnd?: string | null;
  alternativeStartMs?: number[];
  deleteTitleQuery?: string | null;
  updateFromStartISO?: string | null;
  updateToStartISO?: string | null;
  updateFromEndISO?: string | null;
  proceedDespiteConflict?: boolean;
  clarificationKind?: 'move_event' | 'delete_event' | 'create_duplicate_confirmation' | null;
  selectionCandidates?: CalendarPendingConflictEvent[];
};

export type ConversationEventPointer = {
  eventId: string;
  eventName: string;
  startISO: string;
  endISO: string;
  dateKey: string;
  savedAtMs: number;
};

export type CalendarConversationSnapshot = {
  state: CalendarConversationState;
  pendingAction: CalendarPendingAction | null;
};

export type CalendarWorkingMemory = {
  lastCreatedEventId: string | null;
  lastCreatedEventName: string | null;
  lastModifiedEventId: string | null;
  lastModifiedEventName: string | null;
  lastReferencedEventId: string | null;
  lastReferencedEventName: string | null;
  lastCreated: ConversationEventPointer | null;
  lastModified: ConversationEventPointer | null;
  lastReferenced: ConversationEventPointer | null;
  pendingTarget: ConversationEventPointer | null;
  lastCalendarSnapshot: CalendarEvent[];
  snapshotRefreshedAtMs: number | null;
};

const CONVERSATION_EVENT_MEMORY_TTL_MS = 30 * 60 * 1000;
const SYNCING_MAX_MS = 45_000;

const IDLE_SNAPSHOT: CalendarConversationSnapshot = {
  state: 'IDLE',
  pendingAction: null,
};

let conversationSnapshot: CalendarConversationSnapshot = { ...IDLE_SNAPSHOT };
let workingMemory: CalendarWorkingMemory = emptyWorkingMemory();
let syncingStartedAtMs: number | null = null;
const deletedEventTombstones = new Set<string>();

export const LOCAL_CALENDAR_STORE_FRESH_MS = 5 * 60 * 1000;

export function getDeletedEventTombstones(): ReadonlySet<string> {
  return deletedEventTombstones;
}

export function isLocalCalendarStoreFresh(nowMs = Date.now()) {
  const refreshedAt = workingMemory.snapshotRefreshedAtMs;

  return refreshedAt !== null && nowMs - refreshedAt <= LOCAL_CALENDAR_STORE_FRESH_MS;
}

function clearPointerIfMatches(eventId: string) {
  const clear = (pointer: ConversationEventPointer | null) =>
    pointer?.eventId === eventId ? null : pointer;

  return {
    lastCreated: clear(workingMemory.lastCreated),
    lastModified: clear(workingMemory.lastModified),
    lastReferenced: clear(workingMemory.lastReferenced),
    pendingTarget: clear(workingMemory.pendingTarget),
  };
}

export function purgeDeletedEventFromConversation(eventId: string, reason: string) {
  if (!eventId || eventId.startsWith('pending:')) {
    return;
  }

  deletedEventTombstones.add(eventId);
  removeCalendarStoreEvent(eventId, reason);

  const cleared = clearPointerIfMatches(eventId);
  workingMemory = syncFlatIds({
    ...workingMemory,
    ...cleared,
  });

  if (
    conversationSnapshot.pendingAction &&
    [
      conversationSnapshot.pendingAction.targetEventId,
      conversationSnapshot.pendingAction.updateEventId,
      conversationSnapshot.pendingAction.candidateEventId,
    ].includes(eventId)
  ) {
    resetCalendarConversationState('deleted_event_pending_cleared');
  }

  console.log('[CALENDAR CONVERSATION STORE] deleted event purged');
  console.log(JSON.stringify({ eventId, reason }));
}

function emptyWorkingMemory(): CalendarWorkingMemory {
  return {
    lastCreatedEventId: null,
    lastCreatedEventName: null,
    lastModifiedEventId: null,
    lastModifiedEventName: null,
    lastReferencedEventId: null,
    lastReferencedEventName: null,
    lastCreated: null,
    lastModified: null,
    lastReferenced: null,
    pendingTarget: null,
    lastCalendarSnapshot: [],
    snapshotRefreshedAtMs: null,
  };
}

function syncFlatIds(memory: CalendarWorkingMemory): CalendarWorkingMemory {
  return {
    ...memory,
    lastCreatedEventId: memory.lastCreated?.eventId ?? null,
    lastCreatedEventName: memory.lastCreated?.eventName ?? null,
    lastModifiedEventId: memory.lastModified?.eventId ?? null,
    lastModifiedEventName: memory.lastModified?.eventName ?? null,
    lastReferencedEventId: memory.lastReferenced?.eventId ?? null,
    lastReferencedEventName: memory.lastReferenced?.eventName ?? null,
  };
}

function buildPointer(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}): ConversationEventPointer {
  const timeZone = getExecutiveCalendarTimezone();
  const ymd = getZonedYmd(new Date(params.startISO), timeZone);

  return {
    eventId: params.eventId,
    eventName: params.title.trim(),
    startISO: params.startISO,
    endISO: params.endISO,
    dateKey: formatDateKey(ymd),
    savedAtMs: Date.now(),
  };
}

function pointerToCalendarEvent(pointer: ConversationEventPointer): CalendarEvent {
  return {
    id: pointer.eventId,
    title: pointer.eventName,
    startsAt: pointer.startISO,
    endsAt: pointer.endISO,
    isAllDay: false,
  };
}

function isPointerFresh(pointer: ConversationEventPointer) {
  return (
    isCalendarConversationContextFresh() &&
    Date.now() - pointer.savedAtMs <= CONVERSATION_EVENT_MEMORY_TTL_MS
  );
}

export function getCalendarConversationSnapshot(): CalendarConversationSnapshot {
  expireSyncingStateIfStuck();

  return conversationSnapshot;
}

export function getCalendarWorkingMemory() {
  return workingMemory;
}

export function getLastCalendarSnapshot() {
  return workingMemory.lastCalendarSnapshot;
}

export function isCalendarConversationAwaitingInput() {
  const snapshot = getCalendarConversationSnapshot();

  return snapshot.state !== 'IDLE' && snapshot.pendingAction !== null;
}

export function isCalendarConflictDecisionState(state: CalendarConversationState) {
  return (
    state === 'AWAITING_CONFLICT_CONFIRMATION' ||
    state === 'WAITING_CONFLICT_RESOLUTION' ||
    state === 'WAITING_CONFLICT_DECISION' ||
    state === 'WAITING_CONFLICT_CONFIRMATION' ||
    state === 'WAITING_ALTERNATIVE_SELECTION' ||
    state === 'WAITING_ALTERNATIVE_SLOT' ||
    state === 'WAITING_NEW_TIME'
  );
}

export function isAwaitingCalendarConflictResolution() {
  const snapshot = getCalendarConversationSnapshot();

  return (
    isCalendarConversationAwaitingInput() && isCalendarConflictDecisionState(snapshot.state)
  );
}

export function logCalendarConversationEvent(payload: {
  event: 'incoming' | 'transition' | 'handled' | 'reset';
  incomingMessage?: string;
  fromState?: CalendarConversationState;
  toState?: CalendarConversationState;
  pendingAction?: CalendarPendingAction | null;
  detail?: string;
}) {
  console.log('[CALENDAR CONVERSATION STATE]');
  console.log(`event=${payload.event}`);

  if (payload.incomingMessage !== undefined) {
    console.log(`incomingMessage=${payload.incomingMessage}`);
  }

  if (payload.fromState) {
    console.log(`fromState=${payload.fromState}`);
  }

  if (payload.toState) {
    console.log(`toState=${payload.toState}`);
  }

  if (payload.pendingAction) {
    console.log(
      `pendingAction=${JSON.stringify({
        pendingActionId: payload.pendingAction.pendingActionId,
        actionType: payload.pendingAction.actionType,
        eventTitle: payload.pendingAction.eventTitle,
        requestedTimeIso: payload.pendingAction.requestedTimeIso,
        sourceTranscriptPreview: payload.pendingAction.sourceTranscript.slice(0, 120),
      })}`,
    );
  } else if (payload.event === 'transition' || payload.event === 'reset') {
    console.log('pendingAction=null');
  }

  if (payload.detail) {
    console.log(`detail=${payload.detail}`);
  }
}

export function mapOperationToPendingActionKind(operation: 'create' | 'update' | 'delete'): CalendarPendingActionKind {
  if (operation === 'update') {
    return 'update';
  }

  if (operation === 'delete') {
    return 'delete';
  }

  return 'create';
}

export function mapPendingActionKindToLegacyType(kind: CalendarPendingActionKind): CalendarPendingActionType {
  if (kind === 'update') {
    return 'UPDATE_EVENT';
  }

  if (kind === 'delete') {
    return 'DELETE_EVENT';
  }

  return 'CREATE_EVENT';
}

export function pendingActionToIso(startMs: number) {
  return new Date(startMs).toISOString();
}

export function mapOperationToPendingActionType(
  operation: 'create' | 'update' | 'delete',
): CalendarPendingActionType {
  return mapPendingActionKindToLegacyType(mapOperationToPendingActionKind(operation));
}

export function mapPendingActionTypeToCommandIntent(
  action: CalendarPendingActionType,
): 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event' {
  if (action === 'UPDATE_EVENT') {
    return 'update_calendar_event';
  }

  if (action === 'DELETE_EVENT') {
    return 'delete_calendar_event';
  }

  return 'create_calendar_event';
}

export function buildCalendarPendingAction(params: {
  actionType: CalendarPendingActionKind;
  originalIntent: string;
  eventTitle: string;
  sourceTranscript: string;
  titleSourceTranscript?: string | null;
  languageCode: VoiceLanguageCode;
  proposedStartMs: number;
  proposedEndMs: number;
  candidateEventId?: string | null;
  conflictEvents?: CalendarPendingConflictEvent[];
  updateEventId?: string | null;
  conflictingEventId?: string | null;
  conflictingTitle?: string | null;
  conflictingEventTitle?: string | null;
  conflictingStartsAt?: string | null;
  conflictingEndsAt?: string | null;
  targetEventId?: string | null;
  targetEventTitle?: string | null;
  originalStart?: string | null;
  originalEnd?: string | null;
  requestedNewStart?: string | null;
  requestedNewEnd?: string | null;
  alternativeStartMs?: number[];
  deleteTitleQuery?: string | null;
  updateFromStartISO?: string | null;
  updateToStartISO?: string | null;
  updateFromEndISO?: string | null;
  proceedDespiteConflict?: boolean;
  clarificationKind?: 'move_event' | 'delete_event' | 'create_duplicate_confirmation' | null;
  selectionCandidates?: CalendarPendingConflictEvent[];
  pendingActionId?: string;
  createdAtMs?: number;
}): CalendarPendingAction {
  const action = mapPendingActionKindToLegacyType(params.actionType);

  return {
    pendingActionId: params.pendingActionId ?? createPendingActionId(),
    actionType: params.actionType,
    originalIntent: params.originalIntent.trim(),
    candidateEventId: params.candidateEventId ?? params.updateEventId ?? null,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    conflictEvents: params.conflictEvents ?? [],
    createdAtMs: params.createdAtMs ?? Date.now(),
    action,
    eventTitle: params.eventTitle,
    sourceTranscript: params.sourceTranscript.trim(),
    titleSourceTranscript: params.titleSourceTranscript?.trim() || null,
    languageCode: params.languageCode,
    requestedStartMs: params.proposedStartMs,
    requestedEndMs: params.proposedEndMs,
    requestedTimeIso: pendingActionToIso(params.proposedStartMs),
    updateEventId: params.updateEventId ?? null,
    conflictingEventId: params.conflictingEventId ?? null,
    conflictingTitle: params.conflictingTitle ?? params.conflictingEventTitle ?? null,
    conflictingEventTitle: params.conflictingEventTitle ?? params.conflictingTitle ?? null,
    conflictingStartsAt: params.conflictingStartsAt ?? null,
    conflictingEndsAt: params.conflictingEndsAt ?? null,
    targetEventId: params.targetEventId ?? params.updateEventId ?? null,
    targetEventTitle: params.targetEventTitle ?? params.eventTitle,
    originalStart: params.originalStart ?? params.updateFromStartISO ?? null,
    originalEnd: params.originalEnd ?? params.updateFromEndISO ?? null,
    requestedNewStart:
      params.requestedNewStart ??
      (params.proposedStartMs > 0 ? pendingActionToIso(params.proposedStartMs) : null),
    requestedNewEnd:
      params.requestedNewEnd ??
      (params.proposedEndMs > 0 ? pendingActionToIso(params.proposedEndMs) : null),
    alternativeStartMs: params.alternativeStartMs,
    deleteTitleQuery: params.deleteTitleQuery ?? null,
    updateFromStartISO: params.updateFromStartISO ?? null,
    updateToStartISO: params.updateToStartISO ?? null,
    updateFromEndISO: params.updateFromEndISO ?? null,
    proceedDespiteConflict: params.proceedDespiteConflict ?? false,
    clarificationKind: params.clarificationKind ?? null,
    selectionCandidates: params.selectionCandidates ?? params.conflictEvents ?? [],
  };
}

export function transitionCalendarConversationState(params: {
  toState: CalendarConversationState;
  pendingAction: CalendarPendingAction | null;
  reason: string;
  incomingMessage?: string;
}) {
  const fromState = conversationSnapshot.state;
  const toState = params.toState;

  conversationSnapshot = {
    state: toState,
    pendingAction: params.pendingAction,
  };

  if (params.pendingAction && fromState === 'IDLE') {
    logPendingStateCreated(params.pendingAction);
  }

  if (params.pendingAction && isCalendarConflictDecisionState(toState)) {
    bindPendingTargetFromAction(params.pendingAction);
  }

  if (toState === 'IDLE') {
    workingMemory = syncFlatIds({ ...workingMemory, pendingTarget: null });
  }

  if (toState === 'EXECUTING_OPERATION' || toState === 'SYNCING_CALENDAR') {
    if (toState === 'SYNCING_CALENDAR') {
      syncingStartedAtMs = Date.now();
    }
  } else {
    syncingStartedAtMs = null;
  }

  logCalendarConversationEvent({
    event: 'transition',
    incomingMessage: params.incomingMessage,
    fromState,
    toState,
    pendingAction: params.pendingAction,
    detail: params.reason,
  });
}

export function resetCalendarConversationState(reason: string, incomingMessage?: string) {
  const fromState = conversationSnapshot.state;

  conversationSnapshot = { ...IDLE_SNAPSHOT };
  workingMemory = syncFlatIds({ ...workingMemory, pendingTarget: null });
  syncingStartedAtMs = null;

  logCalendarConversationEvent({
    event: 'reset',
    incomingMessage,
    fromState,
    toState: 'IDLE',
    detail: reason,
  });
}

export function resetCalendarConversationStore(reason: string) {
  conversationSnapshot = { ...IDLE_SNAPSHOT };
  workingMemory = emptyWorkingMemory();
  syncingStartedAtMs = null;
  deletedEventTombstones.clear();

  console.log('[CALENDAR CONVERSATION STORE RESET]');
  console.log(`reason=${reason}`);
}

function expireSyncingStateIfStuck() {
  if (conversationSnapshot.state !== 'SYNCING_CALENDAR' || syncingStartedAtMs === null) {
    return;
  }

  if (Date.now() - syncingStartedAtMs <= SYNCING_MAX_MS) {
    return;
  }

  console.log('[CALENDAR CONVERSATION STATE] SYNCING_CALENDAR timeout — returning to IDLE');

  conversationSnapshot = {
    state: 'IDLE',
    pendingAction: null,
  };
  syncingStartedAtMs = null;
}

export function beginCalendarExecutingOperation(reason: string) {
  if (conversationSnapshot.state === 'IDLE') {
    transitionCalendarConversationState({
      toState: 'EXECUTING_OPERATION',
      pendingAction: null,
      reason,
    });
  }
}

export function beginCalendarSnapshotSync(reason: string) {
  transitionCalendarConversationState({
    toState: 'SYNCING_CALENDAR',
    pendingAction: conversationSnapshot.pendingAction,
    reason,
  });
}

export function endCalendarSnapshotSync(params: { success: boolean; reason: string }) {
  const pending = conversationSnapshot.pendingAction;
  const resumeState: CalendarConversationState =
    pending && isCalendarConflictDecisionState(conversationSnapshot.state)
      ? 'AWAITING_CONFLICT_CONFIRMATION'
      : pending?.actionType === 'update' || pending?.actionType === 'delete'
        ? 'AWAITING_EVENT_SELECTION'
        : 'IDLE';

  transitionCalendarConversationState({
    toState: params.success ? (pending ? resumeState : 'IDLE') : pending ? resumeState : 'IDLE',
    pendingAction: pending,
    reason: params.reason,
  });
}

function bindPendingTargetFromAction(pending: CalendarPendingAction) {
  const pointer = buildPointer({
    eventId:
      pending.targetEventId ??
      pending.updateEventId ??
      pending.candidateEventId ??
      `pending:${pending.pendingActionId}`,
    title: pending.targetEventTitle ?? pending.eventTitle,
    startISO:
      pending.originalStart ??
      pending.updateFromStartISO ??
      new Date(pending.requestedStartMs).toISOString(),
    endISO:
      pending.originalEnd ??
      pending.updateFromEndISO ??
      new Date(pending.requestedEndMs).toISOString(),
  });

  touchCalendarConversationContext();
  workingMemory = syncFlatIds({
    ...workingMemory,
    pendingTarget: pointer,
  });
}

export function clearPendingTargetInMemory() {
  if (!workingMemory.pendingTarget) {
    return;
  }

  workingMemory = syncFlatIds({ ...workingMemory, pendingTarget: null });
  console.log('[CALENDAR CONVERSATION STORE] pendingTarget cleared');
}

export function upsertCalendarStoreEvent(event: CalendarEvent, reason: string) {
  if (event.id.startsWith('pending:') || event.id.startsWith('pending-intent:')) {
    return;
  }

  setLastCalendarSnapshot(
    mergeCalendarEventLists([event], workingMemory.lastCalendarSnapshot),
    reason,
  );
  replaceLiveCalendarEvents(mergeCalendarEventLists([event], getLiveCalendarEvents()));
}

export function removeCalendarStoreEvent(eventId: string, reason: string) {
  setLastCalendarSnapshot(
    workingMemory.lastCalendarSnapshot.filter((event) => event.id !== eventId),
    reason,
  );
  replaceLiveCalendarEvents(getLiveCalendarEvents().filter((event) => event.id !== eventId));
}

export function commitCreatedCalendarEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const pointer = buildPointer(params);
  const event = pointerToCalendarEvent(pointer);

  touchCalendarConversationContext();
  workingMemory = syncFlatIds({
    ...workingMemory,
    pendingTarget: null,
    lastCreated: pointer,
    lastReferenced: pointer,
  });
  upsertCalendarStoreEvent(event, 'create_committed');

  console.log('[CALENDAR CONVERSATION STORE] lastCreated committed');
  console.log(JSON.stringify({ eventId: pointer.eventId, title: pointer.eventName }));
}

export function commitModifiedCalendarEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const pointer = buildPointer(params);
  const event = pointerToCalendarEvent(pointer);

  touchCalendarConversationContext();
  workingMemory = syncFlatIds({
    ...workingMemory,
    pendingTarget: null,
    lastModified: pointer,
    lastReferenced: pointer,
  });
  upsertCalendarStoreEvent(event, 'update_committed');

  console.log('[CALENDAR CONVERSATION STORE] lastModified committed');
  console.log(JSON.stringify({ eventId: pointer.eventId, title: pointer.eventName }));
}

export function commitReferencedCalendarEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const pointer = buildPointer(params);

  touchCalendarConversationContext();
  workingMemory = syncFlatIds({
    ...workingMemory,
    lastReferenced: pointer,
  });
  upsertPointerInSnapshot(pointer);

  console.log('[CALENDAR CONVERSATION STORE] lastReferenced committed');
}

export function commitDeletedCalendarEvent(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
}) {
  const pointer = buildPointer(params);

  purgeDeletedEventFromConversation(params.eventId, 'delete_committed');
  touchCalendarConversationContext();
  workingMemory = syncFlatIds({
    ...workingMemory,
    pendingTarget: null,
    lastReferenced: pointer,
  });

  console.log('[CALENDAR CONVERSATION STORE] lastReferenced committed after delete');
  console.log(JSON.stringify({ eventId: pointer.eventId, title: pointer.eventName }));
}

export function commitVerifiedCalendarMutation(params: {
  actionType: 'create' | 'update' | 'delete' | 'search';
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  clearPendingWorkflow: boolean;
}) {
  if (params.actionType === 'create') {
    commitCreatedCalendarEvent(params);
  } else if (params.actionType === 'update') {
    commitModifiedCalendarEvent(params);
  } else if (params.actionType === 'delete') {
    commitDeletedCalendarEvent(params);
  } else {
    commitReferencedCalendarEvent(params);
  }

  if (params.clearPendingWorkflow) {
    resetCalendarConversationState('verified_mutation');
  }
}

export function setLastCalendarSnapshot(events: CalendarEvent[], reason: string) {
  const deduplicated = mergeCalendarEventLists(events, []);

  logCalendarEventDeduplication({
    stage: 'set_last_calendar_snapshot',
    rawCount: events.length,
    deduplicatedCount: deduplicated.length,
  });

  workingMemory = syncFlatIds({
    ...workingMemory,
    lastCalendarSnapshot: deduplicated,
    snapshotRefreshedAtMs: Date.now(),
  });

  console.log('[CALENDAR CONVERSATION STORE] snapshot updated');
  console.log(JSON.stringify({ reason, eventCount: deduplicated.length }));
}

function upsertPointerInSnapshot(pointer: ConversationEventPointer) {
  if (pointer.eventId.startsWith('pending:')) {
    return;
  }

  setLastCalendarSnapshot(
    mergeCalendarEventLists([pointerToCalendarEvent(pointer)], workingMemory.lastCalendarSnapshot),
    'memory_pin',
  );
}

export function getConversationPointersForResolution(): ConversationEventPointer[] {
  const includePendingTarget = isCalendarConversationAwaitingInput();

  const pointers = [
    includePendingTarget ? workingMemory.pendingTarget : null,
    workingMemory.lastReferenced,
    workingMemory.lastModified,
    workingMemory.lastCreated,
  ].filter((pointer): pointer is ConversationEventPointer => Boolean(pointer && isPointerFresh(pointer)));

  const seen = new Set<string>();

  return pointers.filter((pointer) => {
    if (seen.has(pointer.eventId)) {
      return false;
    }

    seen.add(pointer.eventId);
    return true;
  });
}

function filterOutDeletedTombstones(events: CalendarEvent[]) {
  if (deletedEventTombstones.size === 0) {
    return events;
  }

  return events.filter((event) => !deletedEventTombstones.has(event.id));
}

export function augmentEventsWithConversationContext(fetchedEvents: CalendarEvent[]): CalendarEvent[] {
  const pinned = getConversationPointersForResolution()
    .filter(
      (pointer) =>
        !pointer.eventId.startsWith('pending:') && !deletedEventTombstones.has(pointer.eventId),
    )
    .map(pointerToCalendarEvent);

  const merged = filterOutDeletedTombstones(
    mergeCalendarEventLists(
      mergeCalendarEventLists(fetchedEvents, workingMemory.lastCalendarSnapshot),
      pinned,
    ),
  );

  const deduplicated = deduplicateCalendarEvents(merged);

  logCalendarEventDeduplication({
    stage: 'augment_conversation_context',
    rawCount: fetchedEvents.length,
    localStoredCount: workingMemory.lastCalendarSnapshot.length,
    deduplicatedCount: deduplicated.length,
  });

  return deduplicated;
}

export function resolveExplicitTitleFromMemory(
  titleQuery: string,
  events: CalendarEvent[],
): CalendarEvent | null {
  const query = titleQuery.trim();

  if (!query) {
    return null;
  }

  const fromAugmented = events.filter((event) =>
    event.title.trim().toLowerCase().includes(query.toLowerCase()) ||
    query.toLowerCase().includes(event.title.trim().toLowerCase()),
  );

  if (fromAugmented.length === 1) {
    return fromAugmented[0];
  }

  const exact = events.find(
    (event) => event.title.trim().toLowerCase() === query.toLowerCase(),
  );

  return exact ?? null;
}
