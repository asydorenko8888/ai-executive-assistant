import type { ChatMessage } from '@/src/entities/chat/types';
import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { AssistantResponseMode, FactualGroundingStatus } from '@/src/features/agent/factual/factualTimeGrounding';
import type { AssistantIntentAnalysis } from '@/src/features/agent/intent/assistantIntentRouter';
import type { AssistantBehaviorMode } from '@/src/features/agent/intent/assistantBehaviorRouter';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export type AssistantTurnRoute =
  | 'operational_local'
  | 'factual_local'
  | 'advisory_local'
  | 'clarification_local'
  | 'humanized_calendar'
  | 'voice_gym_pivot'
  | 'voice_session_followup'
  | 'llm';

export type AssistantTurnResolution = {
  route: AssistantTurnRoute;
  intent: AssistantIntentAnalysis;
  reply: string | null;
  intentPrompt: string | null;
  userTranscript: string;
  latestUserMessageId: string | null;
  executionState: AssistantExecutionState;
  operationalStarted: boolean;
  responseMode: AssistantResponseMode;
  factualGroundingStatus: FactualGroundingStatus;
  requiresCalendarAuth?: boolean;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
  spokenReply?: string;
  calendarVerified?: boolean;
  behaviorMode?: AssistantBehaviorMode;
  selectedTool?: string;
};

export type ResolveAssistantTurnParams = {
  messages: ChatMessage[];
  orchestrator: ExecutiveAgentOrchestrator;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  enableVoiceShortcuts?: boolean;
};
