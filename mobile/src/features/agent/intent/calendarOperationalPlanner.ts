import {
  logExecutionEvent,
  logPlannerFailure,
  type AssistantExecutionState,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  classifyAssistantIntent,
  logAssistantIntentRouting,
} from '@/src/features/agent/intent/assistantIntentRouter';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import type { ActionExecutionStatus } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';

export type CalendarPlannerFailureReason =
  | 'not_calendar_write_intent'
  | 'date_parse_failed'
  | 'calendar_not_connected'
  | 'calendar_write_forbidden'
  | 'calendar_api_unavailable'
  | 'calendar_verification_failed'
  | 'calendar_network_error'
  | 'planner_exception';

export type CalendarOperationalPlannerResult = {
  state: AssistantExecutionState;
  reply: string;
  spokenReply: string;
  executionState: import('@/src/features/agent/execution/calendarExecutionStates').CalendarExecutionState;
  verified: boolean;
  failureReason?: CalendarPlannerFailureReason;
  scheduleLabel?: string | null;
  scheduleIso?: string | null;
  actionStatus: ActionExecutionStatus;
  requiresCalendarAuth?: boolean;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
};

export type CalendarOperationalPlannerParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

function mapActionStatusToExecutionState(status: ActionExecutionStatus): AssistantExecutionState {
  if (status === 'executing') {
    return 'tool_call';
  }

  if (status === 'success') {
    return 'tool_success';
  }

  if (status === 'failed') {
    return 'tool_failure';
  }

  return 'planning';
}

function mapErrorCodeToFailureReason(errorCode?: string): CalendarPlannerFailureReason | undefined {
  if (!errorCode) {
    return undefined;
  }

  if (errorCode === 'date_parse_failed') {
    return 'date_parse_failed';
  }

  if (errorCode === 'calendar_not_connected') {
    return 'calendar_not_connected';
  }

  if (errorCode === 'calendar_write_forbidden') {
    return 'calendar_write_forbidden';
  }

  if (errorCode === 'calendar_api_unavailable') {
    return 'calendar_api_unavailable';
  }

  if (errorCode === 'calendar_verification_failed') {
    return 'calendar_verification_failed';
  }

  if (errorCode === 'calendar_network_error') {
    return 'calendar_network_error';
  }

  return undefined;
}

export async function executeCalendarOperationalPlanner(
  params: CalendarOperationalPlannerParams,
): Promise<CalendarOperationalPlannerResult | null> {
  if (!isOperationalCalendarWriteRequest(params.transcript)) {
    return null;
  }

  const intent = classifyAssistantIntent(params.transcript);
  logExecutionEvent('intent_detection', 'Calendar operational planner input', {
    transcriptPreview: params.transcript.slice(0, 120),
    intent: intent.primary,
    hardOperational: intent.hasHardOperationalIntent,
  });
  logAssistantIntentRouting(params.transcript, intent);

  logExecutionEvent('planner_activation', 'Calendar operational planner started');

  let state: AssistantExecutionState = 'planning';

  try {
    const execution = await executeCalendarCreateEvent(params);
    state = mapActionStatusToExecutionState(execution.result.status);

    logExecutionEvent('calendar_tool', 'Calendar create execution finished', {
      actionStatus: execution.result.status,
      verified: execution.result.verified,
      errorCode: execution.result.errorCode ?? null,
      eventId: execution.result.event?.id ?? null,
    });

    if (execution.result.status === 'failed') {
      logPlannerFailure(execution.result.errorCode ?? 'calendar_execution_failed');
    }

    return {
      state: execution.requiresCalendarAuth ? 'tool_call' : state,
      failureReason: mapErrorCodeToFailureReason(execution.result.errorCode),
      reply: execution.reply,
      spokenReply: execution.spokenReply,
      scheduleLabel: null,
      scheduleIso: execution.scheduleIso ?? null,
      actionStatus: execution.result.status,
      executionState: execution.executionState,
      verified: execution.verified,
      requiresCalendarAuth: execution.requiresCalendarAuth,
      operationalUxPhase: execution.operationalUxPhase,
      pendingActionId: execution.pendingActionId,
    };
  } catch (error) {
    logPlannerFailure('planner_exception', error);
    state = 'tool_failure';

    const failureReply =
      params.languageCode === 'ru-RU'
        ? 'Не удалось подтвердить создание события в Google Calendar.'
        : params.languageCode === 'uk-UA'
          ? 'Не вдалося підтвердити створення події в Google Calendar.'
          : "I couldn't confirm event creation.";

    return {
      state,
      failureReason: 'planner_exception',
      reply: failureReply,
      spokenReply: failureReply,
      executionState: 'failed',
      verified: false,
      scheduleLabel: null,
      scheduleIso: null,
      actionStatus: 'failed',
    };
  } finally {
    logExecutionEvent('planner_activation', 'Calendar operational planner finished', { finalState: state });
  }
}
