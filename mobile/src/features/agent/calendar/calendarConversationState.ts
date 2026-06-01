import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarConversationState =
  | 'IDLE'
  | 'WAITING_CONFLICT_CONFIRMATION'
  | 'WAITING_EVENT_SELECTION'
  | 'WAITING_NEW_TIME'
  | 'WAITING_DELETE_CONFIRMATION'
  | 'WAITING_MOVE_CONFIRMATION';

export type CalendarPendingActionType = 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT';

export type CalendarPendingAction = {
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
  updateFromTime?: string | null;
  updateToTime?: string | null;
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
    console.log(`pendingAction=${JSON.stringify({
      action: payload.pendingAction.action,
      eventTitle: payload.pendingAction.eventTitle,
      requestedTimeIso: payload.pendingAction.requestedTimeIso,
      sourceTranscriptPreview: payload.pendingAction.sourceTranscript.slice(0, 120),
    })}`);
  } else if (payload.event === 'transition' || payload.event === 'reset') {
    console.log('pendingAction=null');
  }

  if (payload.detail) {
    console.log(`detail=${payload.detail}`);
  }
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
  if (operation === 'update') {
    return 'UPDATE_EVENT';
  }

  if (operation === 'delete') {
    return 'DELETE_EVENT';
  }

  return 'CREATE_EVENT';
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
