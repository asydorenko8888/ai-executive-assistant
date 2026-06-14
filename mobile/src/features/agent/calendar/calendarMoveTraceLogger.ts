import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

export type CalendarMoveTraceGate =
  | 'pipeline_turn_start'
  | 'intent_detected'
  | 'requires_execution'
  | 'behavior_mode'
  | 'mutation_readiness'
  | 'execution_gate'
  | 'executor_called'
  | 'update_executor_started'
  | 'event_selected'
  | 'target_time_resolved'
  | 'patch_request'
  | 'patch_response'
  | 'verify_start'
  | 'stale_terminal_blocked'
  | 'conversation_intercept';

export function logCalendarMovePipelineTurn(params: {
  userTranscript: string;
  actionTranscript: string;
  behaviorMode: string;
}) {
  devConsoleLog('CALENDAR_MOVE_PIPELINE_TURN', {
    userTranscriptPreview: params.userTranscript.slice(0, 160),
    actionTranscriptPreview: params.actionTranscript.slice(0, 160),
    behaviorMode: params.behaviorMode,
  });
}

export function logCalendarMoveIntentDetected(params: {
  intent: CalendarCommandKind;
  transcript: string;
  source: string;
}) {
  devConsoleLog('CALENDAR_INTENT_DETECTED', {
    intent: params.intent,
    source: params.source,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarMoveRequiresExecution(params: {
  allowed: boolean;
  transcript: string;
  reason: string;
}) {
  devConsoleLog('CALENDAR_REQUIRES_EXECUTION', {
    allowed: params.allowed,
    reason: params.reason,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarMoveMutationReadiness(params: {
  intent: CalendarCommandKind;
  ready: boolean;
  missingFields: string[];
  ambiguityReason: string | null;
  transcript: string;
}) {
  devConsoleLog('CALENDAR_MUTATION_READINESS', {
    intent: params.intent,
    ready: params.ready,
    missingFields: params.missingFields,
    ambiguityReason: params.ambiguityReason,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarMoveExecutionGate(params: {
  allowed: boolean;
  blockedBy: string | null;
  intent: CalendarCommandKind;
  behaviorMode: string;
  transcript: string;
}) {
  devConsoleLog('CALENDAR_EXECUTION_GATE', {
    allowed: params.allowed,
    blockedBy: params.blockedBy,
    intent: params.intent,
    behaviorMode: params.behaviorMode,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarMoveExecutorCalled(params: {
  executor: 'executeCalendarCommand' | 'executeCalendarUpdateEvent' | 'updateGoogleCalendarEvent';
  transcript: string;
}) {
  devConsoleLog('CALENDAR_EXECUTOR_CALLED', {
    executor: params.executor,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarUpdateExecutorStarted(params: {
  transcript: string;
  selectedEventId?: string | null;
  storedUpdateTargetId?: string | null;
}) {
  devConsoleLog('CALENDAR_UPDATE_EXECUTOR_STARTED', {
    transcriptPreview: params.transcript.slice(0, 160),
    selectedEventId: params.selectedEventId ?? null,
    storedUpdateTargetId: params.storedUpdateTargetId ?? null,
  });
}

export function logCalendarMoveEventSelected(params: {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  devConsoleLog('CALENDAR_MOVE_EVENT_SELECTED', {
    eventId: params.eventId,
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
  });
}

export function logCalendarMoveTargetTimeResolved(params: {
  eventId: string;
  requestedStart: string;
  requestedEnd: string;
}) {
  devConsoleLog('CALENDAR_MOVE_TARGET_TIME', {
    eventId: params.eventId,
    requestedStart: params.requestedStart,
    requestedEnd: params.requestedEnd,
  });
}

export function logCalendarMoveConversationIntercept(params: {
  handled: boolean;
  reason: string;
  transcript: string;
}) {
  devConsoleLog('CALENDAR_CONVERSATION_INTERCEPT', {
    handled: params.handled,
    reason: params.reason,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarMoveStaleTerminalBlocked(params: {
  requestedTranscript: string;
  staleTranscript: string;
  intent: CalendarCommandKind;
}) {
  devConsoleLog('CALENDAR_STALE_TERMINAL_BLOCKED', {
    requestedTranscriptPreview: params.requestedTranscript.slice(0, 160),
    staleTranscriptPreview: params.staleTranscript.slice(0, 160),
    intent: params.intent,
  });
}

export function logCalendarExecutionBlocked(params: {
  reason: string;
  intent: CalendarCommandKind;
  eventId?: string | null;
  title?: string | null;
  transcript?: string;
  source?: string;
}) {
  devConsoleLog('CALENDAR_EXECUTION_BLOCKED', {
    reason: params.reason,
    intent: params.intent,
    eventId: params.eventId ?? null,
    title: params.title ?? null,
    source: params.source ?? null,
    transcriptPreview: params.transcript?.slice(0, 160) ?? null,
  });
}

export function logCalendarPendingActionCreated(params: {
  action: 'move' | 'delete';
  sourceTranscript: string;
  title?: string | null;
  candidateCount: number;
  candidateEventIds: string[];
  toStartISO?: string | null;
}) {
  devConsoleLog('CALENDAR_PENDING_ACTION_CREATED', {
    action: params.action,
    title: params.title ?? null,
    candidateCount: params.candidateCount,
    candidateEventIds: params.candidateEventIds,
    toStartISO: params.toStartISO ?? null,
    sourceTranscriptPreview: params.sourceTranscript.slice(0, 160),
  });
}

export function logCalendarPendingActionResolved(params: {
  action: 'move' | 'delete';
  selectedEventId: string;
  fromStartISO?: string | null;
  toStartISO?: string | null;
  replyPreview: string;
  sourceTranscriptPreview: string;
}) {
  devConsoleLog('CALENDAR_PENDING_ACTION_RESOLVED', {
    action: params.action,
    selectedEventId: params.selectedEventId,
    fromStartISO: params.fromStartISO ?? null,
    toStartISO: params.toStartISO ?? null,
    replyPreview: params.replyPreview,
    sourceTranscriptPreview: params.sourceTranscriptPreview,
  });
}

export function logCalendarPendingActionExecuted(params: {
  action: 'move' | 'delete';
  selectedEventId: string;
  sourceTranscript: string;
}) {
  devConsoleLog('CALENDAR_PENDING_ACTION_EXECUTED', {
    action: params.action,
    selectedEventId: params.selectedEventId,
    sourceTranscriptPreview: params.sourceTranscript.slice(0, 160),
  });
}
