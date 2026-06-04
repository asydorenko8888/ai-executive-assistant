import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { AssistantTurnRoute } from '@/src/features/agent/conversation/assistantTurnPipeline';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import type { ChatRole } from '@/src/entities/chat/types';

export type ConversationCalendarAction = 'create' | 'update' | 'delete' | 'query' | 'none';

export type ChatMessageDebugMeta = {
  timestampIso: string;
  role: ChatRole;
  detectedIntent: string;
  calendarAction: ConversationCalendarAction;
  route?: AssistantTurnRoute;
  executionState?: AssistantExecutionState;
  toolResponse?: string;
  rawError?: string;
};

export type ConversationExportRecord = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status: string;
  debug: ChatMessageDebugMeta | null;
};
