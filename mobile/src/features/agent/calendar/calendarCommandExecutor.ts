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
import { handleCalendarConversationTurn } from '@/src/features/agent/calendar/calendarConversationTurnHandler';
import {
  classifyPendingCalendarReply,
  logPendingReplyClassified,
} from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  clearPendingCalendarState,
  expirePendingCalendarStateIfStale,
  logNewCommandOverridesPending,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { advanceCalendarConversationTurn } from '@/src/features/agent/calendar/calendarConversationContext';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getPendingIntent,
  mergeTranscriptWithPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
  isCalendarConversationAwaitingInput,
} from '@/src/features/agent/calendar/calendarConversationState';
import { isExplicitDifferentCalendarCommand } from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
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
  advanceCalendarConversationTurn();
  expirePendingCalendarStateIfStale(params.referenceNow);

  const mergedWithPendingIntent = mergeTranscriptWithPendingIntent(params.transcript);

  const enrichedTranscript = enrichCalendarCommandTranscript({
    transcript: mergedWithPendingIntent,
    referenceNow: params.referenceNow,
  });

  if (isCalendarConversationAwaitingInput()) {
    const snapshot = getCalendarConversationSnapshot();
    const pending = snapshot.pendingAction;
    const pendingIntent = getPendingIntent();
    const classification = classifyPendingCalendarReply(enrichedTranscript);
    const inConflictDecision = isCalendarConflictDecisionState(snapshot.state);

    logPendingReplyClassified({
      transcript: enrichedTranscript,
      classification,
      pendingActionId: pending?.pendingActionId ?? null,
    });

    if (inConflictDecision) {
      const conversationTurn = await handleCalendarConversationTurn({
        transcript: params.transcript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        titleSourceTranscript: params.titleSourceTranscript,
        calendarConnected: params.calendarConnected,
      });

      if (conversationTurn) {
        return conversationTurn;
      }

      if (classification !== 'new_calendar_command') {
        const reminder =
          params.languageCode === 'uk-UA'
            ? 'Скажіть «так», «ні», час або «запропонуй інший час».'
            : params.languageCode === 'ru-RU'
              ? 'Скажите «да», «нет», время или «предложи другое время».'
              : 'Say "yes", "no", a time, or ask for another time.';

        return {
          matched: true,
          intent: 'create_calendar_event',
          reply: reminder,
          spokenReply: reminder,
          toolStatus: 'FAILURE',
          executionState: 'tool_failure',
          verified: false,
        };
      }
    }

    const overridesPending =
      classification === 'new_calendar_command' &&
      pending &&
      !pendingIntent &&
      (!inConflictDecision ||
        isExplicitDifferentCalendarCommand(enrichedTranscript, pending));

    if (overridesPending) {
      logNewCommandOverridesPending({
        pendingActionId: pending.pendingActionId,
        transcript: enrichedTranscript,
      });
      clearPendingCalendarState('new_command_override', enrichedTranscript);
    } else if (!inConflictDecision) {
      const conversationTurn = await handleCalendarConversationTurn({
        transcript: enrichedTranscript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        titleSourceTranscript: params.titleSourceTranscript,
        calendarConnected: params.calendarConnected,
      });

      if (conversationTurn) {
        return conversationTurn;
      }
    }
  }

  const intent = detectCalendarCommandIntent(enrichedTranscript);

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
      transcript: enrichedTranscript,
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
    transcript: enrichedTranscript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    referenceNow: params.referenceNow,
  });

  if (!isCalendarExtractionExecutable(extraction)) {
    const validation = validateActionFields({
      transcript: enrichedTranscript,
      referenceNow: params.referenceNow,
    });
    const failureReply = buildClarificationQuestion({
      missingFields: validation.missingFields,
      languageCode: params.languageCode,
    });

    if (intent === 'create_calendar_event') {
      setPendingIntentForClarification({
        intent: 'CREATE_EVENT',
        title: extraction.title?.trim() || 'event',
        sourceTranscript: enrichedTranscript,
      });
    } else if (intent === 'update_calendar_event') {
      setPendingIntentForClarification({
        intent: 'MOVE_EVENT',
        title: extraction.title?.trim() || resolveMoveEventReference(params.referenceNow)?.title || 'event',
        sourceTranscript: enrichedTranscript,
      });
    }

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
    transcript: enrichedTranscript,
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
