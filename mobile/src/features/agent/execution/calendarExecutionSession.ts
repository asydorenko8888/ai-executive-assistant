import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { MAX_CALENDAR_TOOL_RETRIES, type CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import { recordCalendarExecutionDebug } from '@/src/features/settings/storage/calendarExecutionDebugStore';

let calendarOperationInProgress = false;
let calendarRetryCount = 0;
let lastOperationKey: string | null = null;
let lastToolResponse: CalendarToolResponse | null = null;
let currentCalendarOperationEventId: string | null = null;
export type PendingCalendarUpdateContext = {
  operation: 'update';
  title: string | null;
  fromStartISO: string | null;
  toStartISO: string | null;
  sourceTranscript: string;
};

export type PendingCalendarDeleteContext = {
  operation: 'delete';
  title: string | null;
  dayHint: string | null;
  sourceTranscript: string;
};

export type PendingCalendarConflictContext = {
  operation: 'create' | 'update';
  sourceTranscript: string;
  titleSourceTranscript: string | null;
  languageCode: VoiceLanguageCode;
  proposedTitle: string;
  proposedStartMs: number;
  proposedEndMs: number;
  updateEventId: string | null;
  conflictingEventId: string;
  conflictingTitle: string;
  conflictingStartsAt: string;
  conflictingEndsAt: string;
  proceedDespiteConflict: boolean;
};

export type LastCalendarReadMatch = {
  eventId: string;
  title: string;
  startISO: string;
  clockMinutes: number;
  readTimeKind: 'event_at_time' | 'event_starting_at_time';
};

let pendingCalendarUpdateContext: PendingCalendarUpdateContext | null = null;
let pendingCalendarDeleteContext: PendingCalendarDeleteContext | null = null;
let pendingCalendarConflictContext: PendingCalendarConflictContext | null = null;
let lastCalendarReadMatch: LastCalendarReadMatch | null = null;
let lastCommandOutcome: {
  intent: CalendarCommandKind;
  tool: CalendarToolResponse;
  terminalReply: string;
  verified: boolean;
} | null = null;

export function getLastCalendarCommandOutcome() {
  return lastCommandOutcome;
}

export function getPendingCalendarUpdateContext() {
  return pendingCalendarUpdateContext;
}

export function getPendingCalendarDeleteContext() {
  return pendingCalendarDeleteContext;
}

export function getPendingCalendarConflictContext() {
  return pendingCalendarConflictContext;
}

export function getCurrentCalendarOperationEventId() {
  return currentCalendarOperationEventId;
}

export function setCurrentCalendarOperationEventId(eventId: string | null) {
  currentCalendarOperationEventId = eventId;
}

export function setPendingCalendarConflictContext(context: PendingCalendarConflictContext | null) {
  pendingCalendarConflictContext = context;
}

export function clearPendingCalendarConflictContext() {
  pendingCalendarConflictContext = null;
}

export function setPendingCalendarDeleteContext(context: PendingCalendarDeleteContext | null) {
  pendingCalendarDeleteContext = context;
}

export function clearPendingCalendarDeleteIntent() {
  pendingCalendarDeleteContext = null;
}

export function setLastCalendarReadMatch(match: LastCalendarReadMatch | null) {
  lastCalendarReadMatch = match;
}

export function getLastCalendarReadMatch() {
  return lastCalendarReadMatch;
}

export function setPendingCalendarUpdateContext(context: PendingCalendarUpdateContext | null) {
  pendingCalendarUpdateContext = context;
}

export function getPendingCalendarUpdateIntent() {
  return pendingCalendarUpdateContext
    ? { sourceTranscript: pendingCalendarUpdateContext.sourceTranscript }
    : null;
}

export function setPendingCalendarUpdateIntent(params: { sourceTranscript: string }) {
  pendingCalendarUpdateContext = {
    operation: 'update',
    title: null,
    fromStartISO: null,
    toStartISO: null,
    sourceTranscript: params.sourceTranscript.trim(),
  };
}

export function clearPendingCalendarUpdateIntent() {
  pendingCalendarUpdateContext = null;
}

export function setLastCalendarCommandOutcome(outcome: {
  intent: CalendarCommandKind;
  tool: CalendarToolResponse;
  terminalReply: string;
  verified: boolean;
}) {
  lastCommandOutcome = outcome;
  setLastCalendarToolResponse(outcome.tool);
}

function normalizeOperationKey(transcript: string) {
  return transcript.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

export function getLastCalendarToolResponse() {
  return lastToolResponse;
}

export function setLastCalendarToolResponse(response: CalendarToolResponse) {
  lastToolResponse = response;
  recordCalendarExecutionDebug({
    status: response.status,
    errorCode: response.errorCode,
    error: response.error,
    eventId: response.eventId,
  });
  logExecutionAudit('truth_state', {
    finalAssistantState: response.status,
    errorCode: response.errorCode ?? null,
    eventId: response.eventId ?? null,
    verified: response.verified,
  });
}

export function tryBeginCalendarOperation(transcript: string) {
  if (calendarOperationInProgress) {
    logExecutionAudit('tool_call', {
      blocked: true,
      reason: 'calendarOperationInProgress',
    });

    return false;
  }

  const operationKey = normalizeOperationKey(transcript);

  if (lastOperationKey === operationKey && calendarRetryCount >= MAX_CALENDAR_TOOL_RETRIES && lastToolResponse?.status === 'FAILURE') {
    logExecutionAudit('tool_call', {
      blocked: true,
      reason: 'max_retries_exceeded',
      operationKey: operationKey.slice(0, 80),
    });

    return false;
  }

  if (lastOperationKey !== operationKey) {
    calendarRetryCount = 0;
    lastOperationKey = operationKey;
  }

  calendarOperationInProgress = true;

  logExecutionAudit('tool_call', {
    started: true,
    operationKey: operationKey.slice(0, 80),
    retryCount: calendarRetryCount,
  });

  return true;
}

/** User approved a schedule-conflict override — allow the same mutation to run once more. */
export function acknowledgeCalendarConflictConfirmation() {
  calendarRetryCount = 0;
  calendarOperationInProgress = false;
  clearPendingCalendarConflictContext();
}

export function endCalendarOperation(params: { failed: boolean; createdEventId?: string | null }) {
  calendarOperationInProgress = false;

  if (params.createdEventId) {
    currentCalendarOperationEventId = params.createdEventId;
  }

  if (params.failed) {
    calendarRetryCount += 1;
  } else {
    calendarRetryCount = 0;
  }

  logExecutionAudit('tool_call', {
    ended: true,
    retryCount: calendarRetryCount,
  });
}

export function shouldBlockCalendarRecreate(transcript: string) {
  const operationKey = normalizeOperationKey(transcript);

  if (lastToolResponse?.status === 'PENDING' && lastOperationKey === operationKey) {
    return true;
  }

  if (
    lastToolResponse?.status === 'FAILURE' &&
    lastOperationKey === operationKey &&
    calendarRetryCount >= MAX_CALENDAR_TOOL_RETRIES
  ) {
    return true;
  }

  return calendarOperationInProgress;
}

export function resetCalendarExecutionSession() {
  calendarOperationInProgress = false;
  calendarRetryCount = 0;
  lastOperationKey = null;
  lastToolResponse = null;
  currentCalendarOperationEventId = null;
  lastCommandOutcome = null;
  pendingCalendarUpdateContext = null;
  pendingCalendarDeleteContext = null;
  pendingCalendarConflictContext = null;
  lastCalendarReadMatch = null;
  clearPendingCalendarState('session_reset');
  clearPendingIntent('session_reset');
  resetConversationEventMemory('session_reset');
}
