import { isCalendarAgendaQuery } from '@/src/features/agent/calendar/calendarAgendaSync';
import {
  detectCalendarCommandIntent,
  type CalendarCommandKind,
} from '@/src/features/agent/calendar/calendarCommandTypes';
import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { AssistantTurnRoute } from '@/src/features/agent/conversation/assistantTurnPipeline';
import { getLastCalendarCommandOutcome } from '@/src/features/agent/execution/calendarExecutionSession';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import type { ChatRole } from '@/src/entities/chat/types';

import type {
  ChatMessageDebugMeta,
  ConversationCalendarAction,
} from '@/src/features/chat/debug/conversationDebugTypes';

export function mapCalendarIntentToAction(intent: CalendarCommandKind): ConversationCalendarAction {
  switch (intent) {
    case 'create_calendar_event':
      return 'create';
    case 'update_calendar_event':
      return 'update';
    case 'delete_calendar_event':
      return 'delete';
    default:
      return 'none';
  }
}

export function resolveCalendarActionForTranscript(transcript: string): ConversationCalendarAction {
  const intent = detectCalendarCommandIntent(transcript);
  const mapped = mapCalendarIntentToAction(intent);

  if (mapped !== 'none') {
    return mapped;
  }

  return isCalendarAgendaQuery(transcript) ? 'query' : 'none';
}

function formatToolResponse(tool: CalendarToolResponse | null | undefined) {
  if (!tool) {
    return undefined;
  }

  return JSON.stringify(
    {
      status: tool.status,
      verified: tool.verified,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId,
      errorCode: tool.errorCode,
      error: tool.error,
      event: tool.event
        ? {
            id: tool.event.id,
            summary: tool.event.summary,
            startsAt: tool.event.startsAt,
            endsAt: tool.event.endsAt,
          }
        : undefined,
    },
    null,
    2,
  );
}

export function buildUserMessageDebugMeta(params: {
  role: ChatRole;
  transcript: string;
}): ChatMessageDebugMeta {
  const intent = detectCalendarCommandIntent(params.transcript);

  return {
    timestampIso: new Date().toISOString(),
    role: params.role,
    detectedIntent: intent,
    calendarAction: resolveCalendarActionForTranscript(params.transcript),
  };
}

export function buildAssistantMessageDebugMeta(params: {
  userTranscript: string;
  route?: AssistantTurnRoute;
  executionState?: AssistantExecutionState;
  rawError?: string;
}): ChatMessageDebugMeta {
  const calendarOutcome = getLastCalendarCommandOutcome();
  const intent =
    calendarOutcome?.intent ??
    detectCalendarCommandIntent(params.userTranscript);

  return {
    timestampIso: new Date().toISOString(),
    role: 'assistant',
    detectedIntent: intent,
    calendarAction: mapCalendarIntentToAction(intent),
    route: params.route,
    executionState: params.executionState,
    toolResponse: formatToolResponse(calendarOutcome?.tool),
    rawError: params.rawError ?? calendarOutcome?.tool?.error,
  };
}
