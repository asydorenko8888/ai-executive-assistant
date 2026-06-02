import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  clearPendingEventInMemory,
  setPendingEventFromAction,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  createPendingActionId,
  logPendingStateCreated,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';

export type CalendarConversationState =
  | 'IDLE'
  | 'WAITING_CONFLICT_RESOLUTION'
  | 'WAITING_CONFLICT_DECISION'
  | 'WAITING_CONFLICT_CONFIRMATION'
  | 'WAITING_ALTERNATIVE_SELECTION'
  | 'WAITING_ALTERNATIVE_SLOT'
  | 'WAITING_EVENT_CONFIRMATION'
  | 'WAITING_EVENT_SELECTION'
  | 'WAITING_NEW_TIME'
  | 'WAITING_DELETE_CONFIRMATION'
  | 'WAITING_MOVE_CONFIRMATION';

export function isCalendarConflictDecisionState(state: CalendarConversationState) {
  return (
    state === 'WAITING_CONFLICT_RESOLUTION' ||
    state === 'WAITING_CONFLICT_DECISION' ||
    state === 'WAITING_CONFLICT_CONFIRMATION' ||
    state === 'WAITING_ALTERNATIVE_SELECTION' ||
    state === 'WAITING_ALTERNATIVE_SLOT' ||
    state === 'WAITING_NEW_TIME'
  );
}

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
  conflictingStartsAt?: string | null;
  conflictingEndsAt?: string | null;
  alternativeStartMs?: number[];
  deleteTitleQuery?: string | null;
  updateFromStartISO?: string | null;
  updateToStartISO?: string | null;
  proceedDespiteConflict?: boolean;
};

export type CalendarConversationSnapshot = {
  state: CalendarConversationState;
  pendingAction: CalendarPendingAction | null;
};

const IDLE_SNAPSHOT: CalendarConversationSnapshot = {
  state: 'IDLE',
  pendingAction: null,
};

let snapshot: CalendarConversationSnapshot = { ...IDLE_SNAPSHOT };

export function getCalendarConversationSnapshot() {
  return snapshot;
}

export function isCalendarConversationAwaitingInput() {
  return snapshot.state !== 'IDLE' && snapshot.pendingAction !== null;
}

export function isAwaitingCalendarConflictResolution() {
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
  conflictingStartsAt?: string | null;
  conflictingEndsAt?: string | null;
  alternativeStartMs?: number[];
  deleteTitleQuery?: string | null;
  updateFromStartISO?: string | null;
  updateToStartISO?: string | null;
  proceedDespiteConflict?: boolean;
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
    conflictingTitle: params.conflictingTitle ?? null,
    conflictingStartsAt: params.conflictingStartsAt ?? null,
    conflictingEndsAt: params.conflictingEndsAt ?? null,
    alternativeStartMs: params.alternativeStartMs,
    deleteTitleQuery: params.deleteTitleQuery ?? null,
    updateFromStartISO: params.updateFromStartISO ?? null,
    updateToStartISO: params.updateToStartISO ?? null,
    proceedDespiteConflict: params.proceedDespiteConflict ?? false,
  };
}

export function transitionCalendarConversationState(params: {
  toState: CalendarConversationState;
  pendingAction: CalendarPendingAction | null;
  reason: string;
  incomingMessage?: string;
}) {
  const fromState = snapshot.state;

  snapshot = {
    state: params.toState,
    pendingAction: params.pendingAction,
  };

  if (params.pendingAction && fromState === 'IDLE') {
    logPendingStateCreated(params.pendingAction);
  }

  if (params.pendingAction && isCalendarConflictDecisionState(params.toState)) {
    setPendingEventFromAction(params.pendingAction);
  }

  if (params.toState === 'IDLE') {
    clearPendingEventInMemory();
  }

  logCalendarConversationEvent({
    event: 'transition',
    incomingMessage: params.incomingMessage,
    fromState,
    toState: params.toState,
    pendingAction: params.pendingAction,
    detail: params.reason,
  });
}

export function resetCalendarConversationState(reason: string, incomingMessage?: string) {
  const fromState = snapshot.state;

  snapshot = { ...IDLE_SNAPSHOT };

  logCalendarConversationEvent({
    event: 'reset',
    incomingMessage,
    fromState,
    toState: 'IDLE',
    detail: reason,
  });
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
