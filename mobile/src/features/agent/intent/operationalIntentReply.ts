import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import { detectHardOperationalIntent } from '@/src/features/agent/intent/assistantIntentRouter';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { CalendarToolStatus } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarToolReplyFromLastResult,
  buildCalendarToolReplyBundle,
} from '@/src/features/agent/execution/calendarToolResponses';
import {
  getLastCalendarToolResponse,
  shouldBlockCalendarRecreate,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
export type OperationalIntentReplyParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

export type OperationalIntentResult = {
  reply: string;
  spokenReply: string;
  executionState: AssistantExecutionState;
  toolStatus: CalendarToolStatus;
  calendarExecutionState?: CalendarExecutionState;
  verified?: boolean;
  requiresCalendarAuth?: boolean;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
};

function mapAssistantState(toolStatus: CalendarToolStatus, calendarState: CalendarExecutionState): AssistantExecutionState {
  if (toolStatus === 'SUCCESS') {
    return 'tool_success';
  }

  if (toolStatus === 'PENDING') {
    return 'tool_call';
  }

  if (calendarState === 'authenticating') {
    return 'tool_call';
  }

  return 'tool_failure';
}

function bundleToOperationalResult(bundle: ReturnType<typeof buildCalendarToolReplyBundle>): OperationalIntentResult {
  return {
    reply: bundle.reply,
    spokenReply: bundle.spokenReply,
    executionState: mapAssistantState(bundle.tool.status, bundle.executionState),
    toolStatus: bundle.tool.status,
    calendarExecutionState: bundle.executionState,
    verified: bundle.tool.verified,
    requiresCalendarAuth: bundle.requiresCalendarAuth,
    operationalUxPhase:
      bundle.executionState === 'authenticating'
        ? 'connecting'
        : bundle.executionState === 'success'
          ? 'event_created'
          : bundle.executionState === 'failed'
            ? 'failed'
            : 'verifying_event',
  };
}

function buildTerminalCalendarBlockedReply(
  languageCode: VoiceLanguageCode,
  referenceNow: Date,
): OperationalIntentResult {
  const last = getLastCalendarToolResponse();

  if (last) {
    return bundleToOperationalResult(
      buildCalendarToolReplyFromLastResult(languageCode, last, { referenceNow }),
    );
  }

  const tool = createCalendarToolFailure(
    'CALENDAR_MAX_RETRIES_EXCEEDED',
    'Calendar operation blocked to prevent retry loop.',
  );

  return bundleToOperationalResult(
    buildCalendarToolReplyBundle(tool, languageCode, { referenceNow }),
  );
}

export async function tryBuildOperationalIntentReply(
  params: OperationalIntentReplyParams,
): Promise<OperationalIntentResult | null> {
  if (isOperationalCalendarWriteRequest(params.transcript)) {
    logCalendarCreate('routing', {
      action: 'tryBuildOperationalIntentReply',
      matched: 'calendar_write',
      transcriptPreview: params.transcript.slice(0, 120),
    });

    if (shouldBlockCalendarRecreate(params.transcript)) {
      return buildTerminalCalendarBlockedReply(params.languageCode, params.referenceNow);
    }

    const execution = await executeCalendarCreateEvent({
      transcript: params.transcript,
      languageCode: params.languageCode,
      calendarConnected: params.calendarConnected,
      referenceNow: params.referenceNow,
    });

    if (execution.tool.status === 'SUCCESS') {
      logCalendarDecision('createAttemptSucceeded', {
        eventId: execution.tool.eventId ?? null,
        verified: execution.verified,
      });
    } else if (execution.tool.status === 'FAILURE') {
      logCalendarDecision('reasonForRefusal', {
        reason: 'api_failure',
        errorCode: execution.tool.errorCode ?? null,
        error: execution.tool.error ?? null,
      });
    }

    return {
      reply: execution.reply,
      spokenReply: execution.spokenReply,
      executionState: mapAssistantState(execution.tool.status, execution.executionState),
      toolStatus: execution.tool.status,
      calendarExecutionState: execution.executionState,
      verified: execution.verified,
      requiresCalendarAuth: execution.requiresCalendarAuth,
      operationalUxPhase: execution.operationalUxPhase,
      pendingActionId: execution.pendingActionId,
    };
  }

  if (!detectHardOperationalIntent(params.transcript)) {
    return null;
  }

  logCalendarDecision('reasonForRefusal', {
    reason: 'non_calendar_operational_not_supported',
    transcriptPreview: params.transcript.slice(0, 120),
  });

  return null;
}
