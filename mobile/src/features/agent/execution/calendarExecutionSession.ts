import { MAX_CALENDAR_TOOL_RETRIES, type CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import { recordCalendarExecutionDebug } from '@/src/features/settings/storage/calendarExecutionDebugStore';

let calendarOperationInProgress = false;
let calendarRetryCount = 0;
let lastOperationKey: string | null = null;
let lastToolResponse: CalendarToolResponse | null = null;
export type PendingCalendarUpdateContext = {
  operation: 'update';
  title: string | null;
  fromTime: string | null;
  toTime: string | null;
  sourceTranscript: string;
};
let pendingCalendarUpdateContext: PendingCalendarUpdateContext | null = null;
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
    fromTime: null,
    toTime: null,
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

export function endCalendarOperation(params: { failed: boolean }) {
  calendarOperationInProgress = false;

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
  lastCommandOutcome = null;
  pendingCalendarUpdateContext = null;
}
