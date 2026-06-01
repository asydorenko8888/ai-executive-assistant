import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  detectCalendarCommandIntent,
  type CalendarCommandKind,
} from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  extractCalendarCommand,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { handleCalendarConflictFollowUp } from '@/src/features/agent/calendar/calendarConflictCommandGate';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { executeCalendarDeleteEvent } from '@/src/features/agent/execution/calendarDeleteEventExecutor';
import { executeCalendarUpdateEvent } from '@/src/features/agent/execution/calendarUpdateEventExecutor';
import type { CalendarToolStatus } from '@/src/features/agent/execution/calendarToolContract';
import {
  getLastCalendarCommandOutcome,
  setLastCalendarCommandOutcome,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  logCalendarIntentDetected,
  logCalendarTerminalReply,
  logCalendarToolSelected,
} from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  buildClarificationQuestion,
  validateActionFields,
} from '@/src/features/agent/intent/actionFieldValidator';

export type CalendarCommandResult = {
  matched: boolean;
  intent: CalendarCommandKind;
  reply: string;
  spokenReply: string;
  toolStatus: CalendarToolStatus;
  executionState: AssistantExecutionState;
  verified: boolean;
  requiresCalendarAuth?: boolean;
  eventId?: string | null;
};

function mapExecutionState(status: CalendarToolStatus): AssistantExecutionState {
  if (status === 'SUCCESS') {
    return 'tool_success';
  }

  if (status === 'PENDING') {
    return 'tool_call';
  }

  return 'tool_failure';
}

export async function executeCalendarCommand(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
  /** Current user message only — CREATE titles are extracted from this, not merged history. */
  titleSourceTranscript?: string;
}): Promise<CalendarCommandResult> {
  const conflictFollowUp = await handleCalendarConflictFollowUp({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    titleSourceTranscript: params.titleSourceTranscript,
    calendarConnected: params.calendarConnected,
  });

  if (conflictFollowUp) {
    return conflictFollowUp;
  }

  const intent = detectCalendarCommandIntent(params.transcript);

  logCalendarIntentDetected({
    transcript: params.transcript,
    intent,
    requiresTool: intent !== 'none',
  });

  if (intent === 'none') {
    return {
      matched: false,
      intent,
      reply: '',
      spokenReply: '',
      toolStatus: 'FAILURE',
      executionState: 'conversational',
      verified: false,
    };
  }

  if (intent === 'delete_calendar_event') {
    logCalendarToolSelected({ intent, tool: 'google_calendar_delete_event' });

    const outcome = await executeCalendarDeleteEvent({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    const contractOk = isVerifiedCalendarDeleteSuccess(outcome.tool);
    const terminalReply =
      outcome.tool.status === 'SUCCESS' && !contractOk
        ? buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'API reported success but verified delete confirmation is missing',
          )
        : outcome.reply;

    setLastCalendarCommandOutcome({
      intent,
      tool: outcome.tool,
      terminalReply,
      verified: contractOk,
    });

    logCalendarTerminalReply({
      intent,
      tool: outcome.tool,
      replyPreview: terminalReply,
    });

    return {
      matched: true,
      intent,
      reply: terminalReply,
      spokenReply: outcome.spokenReply,
      toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
      executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
      verified: contractOk,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    };
  }

  const toolName =
    intent === 'update_calendar_event'
      ? 'google_calendar_update_event'
      : 'google_calendar_create_event';

  logCalendarToolSelected({ intent, tool: toolName });

  if (intent === 'update_calendar_event') {
    const outcome = await executeCalendarUpdateEvent({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    const contractOk = isVerifiedCalendarUpdateSuccess(outcome.tool);
    const terminalReply =
      outcome.tool.status === 'SUCCESS' && !contractOk
        ? buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'API reported success but verified eventId is missing',
          )
        : outcome.reply;

    setLastCalendarCommandOutcome({
      intent,
      tool: outcome.tool,
      terminalReply,
      verified: contractOk,
    });

    logCalendarTerminalReply({
      intent,
      tool: outcome.tool,
      replyPreview: terminalReply,
    });

    return {
      matched: true,
      intent,
      reply: terminalReply,
      spokenReply: outcome.spokenReply,
      toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
      executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
      verified: contractOk,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    };
  }

  const extraction = extractCalendarCommand({
    transcript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    referenceNow: params.referenceNow,
  });

  if (!isCalendarExtractionExecutable(extraction)) {
    const validation = validateActionFields({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
    });
    const failureReply = buildClarificationQuestion({
      missingFields: validation.missingFields,
      languageCode: params.languageCode,
    });

    setLastCalendarCommandOutcome({
      intent,
      tool: {
        status: 'FAILURE',
        verified: false,
        verificationFetched: false,
        errorCode: 'CALENDAR_DATE_PARSE_FAILED',
        error: failureReply,
      },
      terminalReply: failureReply,
      verified: false,
    });

    return {
      matched: true,
      intent,
      reply: failureReply,
      spokenReply: failureReply,
      toolStatus: 'FAILURE',
      executionState: 'tool_failure',
      verified: false,
    };
  }

  const outcome = await executeCalendarCreateEvent({
    transcript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });

  const contractOk = isVerifiedCalendarCreateSuccess(outcome.tool);
  const terminalReply =
    outcome.tool.status === 'SUCCESS' && !contractOk
      ? buildFailureTerminalReply(
          'CALENDAR_EXECUTION_CONTRACT',
          'API reported success but verified eventId is missing',
        )
      : outcome.reply;

  setLastCalendarCommandOutcome({
    intent,
    tool: outcome.tool,
    terminalReply,
    verified: contractOk,
  });

  logCalendarTerminalReply({
    intent,
    tool: outcome.tool,
    replyPreview: terminalReply,
  });

  return {
    matched: true,
    intent,
    reply: terminalReply,
    spokenReply: outcome.spokenReply,
    toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
    executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
    verified: contractOk,
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  };
}

export function getCalendarCommandTerminalReply(userTranscript: string) {
  const intent = detectCalendarCommandIntent(userTranscript);

  if (intent === 'none') {
    return null;
  }

  const last = getLastCalendarCommandOutcome();

  if (last && last.intent === intent) {
    return last.terminalReply;
  }

  return buildFailureTerminalReply(
    'CALENDAR_EXECUTION_CONTRACT',
    'calendar command required tool execution but no terminal tool result is available',
  );
}
