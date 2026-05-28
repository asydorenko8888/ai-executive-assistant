import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  detectCalendarCommandIntent,
  type CalendarCommandKind,
} from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarCreateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { executeCalendarDeleteEvent } from '@/src/features/agent/execution/calendarDeleteEventExecutor';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import type { CalendarToolStatus } from '@/src/features/agent/execution/calendarToolContract';
import {
  getLastCalendarCommandOutcome,
  setLastCalendarCommandOutcome,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

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
}): Promise<CalendarCommandResult> {
  const intent = detectCalendarCommandIntent(params.transcript);

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

  logCalendarCreate('command executor', {
    intent,
    transcriptPreview: params.transcript.slice(0, 120),
  });

  if (intent === 'delete_calendar_event') {
    const outcome = await executeCalendarDeleteEvent({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    setLastCalendarCommandOutcome({
      intent,
      tool: outcome.tool,
      terminalReply: outcome.reply,
      verified: outcome.verified,
    });

    return {
      matched: true,
      intent,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      toolStatus: outcome.tool.status,
      executionState: mapExecutionState(outcome.tool.status),
      verified: outcome.verified,
      eventId: outcome.tool.eventId ?? null,
    };
  }

  const outcome = await executeCalendarCreateEvent({
    transcript: params.transcript,
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

  console.log('[Calendar Contract] create command finished', {
    intent,
    toolStatus: outcome.tool.status,
    eventId: outcome.tool.eventId ?? null,
    verified: contractOk,
    terminalPreview: terminalReply.slice(0, 120),
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
