import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  assertCalendarReplyMatchesTool,
  buildFailureTerminalReply,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { getCalendarCommandTerminalReply } from '@/src/features/agent/calendar/calendarCommandExecutor';
import {
  getLastCalendarCommandOutcome,
  getPendingCalendarConflictContext,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  isOperationalCalendarWriteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { logCalendarContractEnforced, logCalendarLlmBlocked } from '@/src/features/agent/calendar/calendarExecutionDebugLog';

/**
 * Calendar mutations MUST execute a tool before any assistant text reaches the UI.
 * Conversation-only replies are invalid for these intents.
 */
export function requiresCalendarToolExecution(transcript: string) {
  const trimmed = transcript.trim();

  if (isOperationalCalendarWriteRequest(trimmed)) {
    return true;
  }

  return Boolean(
    getPendingCalendarUpdateContext() ||
      getPendingCalendarDeleteContext() ||
      getPendingCalendarConflictContext(),
  );
}

export function blockLlmForCalendarMutation(params: {
  transcript: string;
  reason: string;
}) {
  if (!requiresCalendarToolExecution(params.transcript)) {
    return null;
  }

  logCalendarLlmBlocked({
    reason: params.reason,
    transcriptPreview: params.transcript.slice(0, 160),
  });

  return (
    getCalendarCommandTerminalReply(params.transcript) ??
    buildFailureTerminalReply(
      'CALENDAR_TOOL_REQUIRED',
      'calendar mutation requires verified tool execution — LLM path blocked',
    )
  );
}

export function enforceCalendarToolReply(params: {
  userTranscript: string;
  candidateReply: string;
}) {
  const pendingUpdate = getPendingCalendarUpdateContext();
  const pendingDelete = getPendingCalendarDeleteContext();
  const pendingConflict = getPendingCalendarConflictContext();
  const requiresTool =
    requiresCalendarToolExecution(params.userTranscript) ||
    Boolean(pendingUpdate || pendingDelete || pendingConflict);

  if (!requiresTool) {
    return params.candidateReply;
  }

  const intent = detectCalendarCommandIntent(params.userTranscript);
  const resolvedIntent =
    intent === 'none'
      ? pendingUpdate
        ? 'update_calendar_event'
        : pendingDelete
          ? 'delete_calendar_event'
          : pendingConflict
            ? pendingConflict.operation === 'update'
              ? 'update_calendar_event'
              : 'create_calendar_event'
            : 'create_calendar_event'
      : intent;
  const lastOutcome = getLastCalendarCommandOutcome();
  const terminal =
    getCalendarCommandTerminalReply(params.userTranscript) ??
    buildFailureTerminalReply(
      'CALENDAR_TOOL_REQUIRED',
      'calendar mutation did not produce a verified tool result',
    );

  const enforced = assertCalendarReplyMatchesTool({
    userTranscript: params.userTranscript,
    candidateReply: params.candidateReply,
    terminalReply: terminal,
    tool: lastOutcome?.tool ?? null,
    intent: resolvedIntent,
  });

  if (enforced !== params.candidateReply) {
    logCalendarContractEnforced({
      blockedPreview: params.candidateReply.slice(0, 160),
      terminalPreview: enforced.slice(0, 160),
    });
  }

  return enforced;
}
