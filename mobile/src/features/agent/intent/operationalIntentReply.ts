import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  classifyAssistantIntent,
  detectHardOperationalIntent,
  type AssistantIntentAnalysis,
} from '@/src/features/agent/intent/assistantIntentRouter';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { executeCalendarOperationalPlanner } from '@/src/features/agent/intent/calendarOperationalPlanner';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
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

  const analysis = classifyAssistantIntent(params.transcript);

  if (!analysis.shouldBypassEmotionalRouting && !detectHardOperationalIntent(params.transcript)) {
    return null;
  }

  if (analysis.operationalSubtype === 'reminder') {
    return null;
  }

  const plannerResult = await executeCalendarOperationalPlanner(params);

  if (plannerResult) {
    return {
      reply: plannerResult.reply,
      spokenReply: plannerResult.spokenReply,
      executionState: plannerResult.state,
      toolStatus: plannerResult.verified ? 'SUCCESS' : plannerResult.requiresCalendarAuth ? 'PENDING' : 'FAILURE',
      calendarExecutionState: plannerResult.executionState,
      verified: plannerResult.verified,
      requiresCalendarAuth: plannerResult.requiresCalendarAuth,
      operationalUxPhase: plannerResult.operationalUxPhase,
      pendingActionId: plannerResult.pendingActionId,
    };
  }

  const reply = 'FAILURE: OPERATION_NOT_SUPPORTED: no operational handler for this request.';

  return {
    reply,
    spokenReply: reply,
    executionState: 'tool_failure',
    toolStatus: 'FAILURE',
    verified: false,
  };
}
