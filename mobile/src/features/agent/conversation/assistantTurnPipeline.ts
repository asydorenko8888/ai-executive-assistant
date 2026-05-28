import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ChatMessage } from '@/src/entities/chat/types';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import { tryBuildHumanizedCalendarReply } from '@/src/features/agent/calendar/calendarHumanizedReply';
import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import {
  assertExecutionTransition,
  logFallbackActivation,
  type AssistantExecutionState,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  buildIntentPrioritySystemPrompt,
  classifyAssistantIntent,
  logAssistantIntentRouting,
  type AssistantIntentAnalysis,
} from '@/src/features/agent/intent/assistantIntentRouter';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { tryBuildOperationalIntentReply } from '@/src/features/agent/intent/operationalIntentReply';
import { guardAgainstRepeatedAssistantResponse, getLatestUserMessage } from '@/src/features/agent/conversation/assistantResponseGuard';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  getConversationPayloadMessages,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';
import { buildVoiceSessionContext } from '@/src/features/voice/memory';
import { buildVoiceSessionMemoryFromMessages } from '@/src/features/voice/memory/voiceSessionFromMessages';
import {
  tryBuildGymLunchPivotReply,
  tryBuildVoiceSessionFollowUpReply,
} from '@/src/features/voice/memory/voiceSessionFollowUp';

export type AssistantTurnRoute =
  | 'operational_local'
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
};

export type ResolveAssistantTurnParams = {
  messages: ChatMessage[];
  orchestrator: ExecutiveAgentOrchestrator;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  enableVoiceShortcuts?: boolean;
};

function logTurnPipeline(stage: string, details: Record<string, unknown>) {
  console.log('[Conversation]', stage, details);
}

export function readFreshConversationMessages() {
  return getConversationPayloadMessages(useExecutiveConversationStore.getState().messages);
}

function tryEmotionalRoute(
  params: ResolveAssistantTurnParams,
  intent: AssistantIntentAnalysis,
  userTranscript: string,
  userMessage: ChatMessage | null,
  calendarEvents: CalendarEvent[],
  calendarConnected: boolean,
  fromState: AssistantExecutionState,
): AssistantTurnResolution | null {
  if (params.enableVoiceShortcuts && userTranscript) {
    const sessionContext = buildVoiceSessionContext(
      buildVoiceSessionMemoryFromMessages(params.messages),
    );

    const gymLunchPivot = tryBuildGymLunchPivotReply({
      transcript: userTranscript,
      session: sessionContext,
      languageCode: params.languageCode,
    });

    if (gymLunchPivot) {
      if (!assertExecutionTransition({ from: fromState, to: 'emotional_support', reason: 'voice_gym_pivot' })) {
        return null;
      }

      logFallbackActivation('voice_gym_pivot', { fromState });

      return {
        route: 'voice_gym_pivot',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: gymLunchPivot,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: buildIntentPrioritySystemPrompt(intent),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'emotional_support',
        operationalStarted: false,
      };
    }

    const humanizedReply = tryBuildHumanizedCalendarReply({
      transcript: userTranscript,
      visibleEvents: calendarEvents,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      sessionContext,
    });

    if (humanizedReply) {
      if (!assertExecutionTransition({ from: fromState, to: 'emotional_support', reason: 'humanized_calendar' })) {
        logFallbackActivation('humanized_calendar blocked after operational', {
          userTranscript: userTranscript.slice(0, 120),
        });
        return null;
      }

      logFallbackActivation('humanized_calendar', { fromState });

      return {
        route: 'humanized_calendar',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: humanizedReply.responseText,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: buildIntentPrioritySystemPrompt(intent),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'emotional_support',
        operationalStarted: false,
      };
    }

    const sessionFollowUp = tryBuildVoiceSessionFollowUpReply({
      transcript: userTranscript,
      session: sessionContext,
      visibleEvents: calendarEvents,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    if (sessionFollowUp) {
      if (!assertExecutionTransition({ from: fromState, to: 'emotional_support', reason: 'voice_session_followup' })) {
        return null;
      }

      logFallbackActivation('voice_session_followup', { fromState });

      return {
        route: 'voice_session_followup',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: sessionFollowUp,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: buildIntentPrioritySystemPrompt(intent),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'emotional_support',
        operationalStarted: false,
      };
    }
  } else if (userTranscript) {
    const sessionContext = buildVoiceSessionContext(
      buildVoiceSessionMemoryFromMessages(params.messages),
    );
    const humanizedReply = tryBuildHumanizedCalendarReply({
      transcript: userTranscript,
      visibleEvents: calendarEvents,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      sessionContext,
    });

    if (humanizedReply) {
      if (!assertExecutionTransition({ from: fromState, to: 'emotional_support', reason: 'humanized_calendar' })) {
        logFallbackActivation('humanized_calendar blocked after operational', {
          userTranscript: userTranscript.slice(0, 120),
        });
        return null;
      }

      logFallbackActivation('humanized_calendar', { fromState });

      return {
        route: 'humanized_calendar',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: humanizedReply.responseText,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: buildIntentPrioritySystemPrompt(intent),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'emotional_support',
        operationalStarted: false,
      };
    }
  }

  return null;
}

export function resolveAssistantTurn(params: ResolveAssistantTurnParams): AssistantTurnResolution {
  const userMessage = getLatestUserMessage(params.messages);
  const userTranscript = userMessage?.content.trim() ?? '';
  const intent = classifyAssistantIntent(userTranscript);
  const operationalStarted = isOperationalCalendarWriteRequest(userTranscript);

  logTurnPipeline('latest user message', {
    id: userMessage?.id ?? null,
    preview: userTranscript.slice(0, 120),
  });
  logAssistantIntentRouting(userTranscript, intent);

  const calendarEvents = getAssistantVisibleCalendarEvents(
    params.orchestrator.snapshot,
    params.referenceNow,
  );
  const calendarConnected =
    params.orchestrator.snapshot.calendarConnection?.status === 'connected';

  const operationalResult = tryBuildOperationalIntentReply({
    transcript: userTranscript,
    languageCode: params.languageCode,
    calendarConnected,
    referenceNow: params.referenceNow,
  });

  if (operationalResult) {
    const guarded = guardAgainstRepeatedAssistantResponse({
      messages: params.messages,
      candidateReply: operationalResult.reply,
      languageCode: params.languageCode,
      calendarConnected,
      referenceNow: params.referenceNow,
    });

    logTurnPipeline('route selected', {
      route: 'operational_local',
      plannerExecution: 'calendarOperationalPlanner',
      emotionalFallback: false,
      executionState: operationalResult.executionState,
    });

    return {
      route: 'operational_local',
      intent,
      reply: guarded,
      intentPrompt: buildIntentPrioritySystemPrompt(intent),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: operationalResult.executionState,
      operationalStarted: true,
    };
  }

  if (intent.shouldBypassEmotionalRouting || operationalStarted) {
    logTurnPipeline('route selected', {
      route: 'llm',
      plannerExecution: 'deferred_llm_operational',
      emotionalFallback: false,
      executionState: 'planning',
      operationalStarted: true,
    });

    return {
      route: 'llm',
      intent,
      reply: null,
      intentPrompt: buildIntentPrioritySystemPrompt(intent),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'planning',
      operationalStarted: true,
    };
  }

  logTurnPipeline('emotional fallback eligible', {
    emotionalFallback: true,
    actionConfidence: intent.actionConfidence,
    conversationalConfidence: intent.conversationalConfidence,
    executionState: 'conversational',
  });

  const emotionalRoute = tryEmotionalRoute(
    params,
    intent,
    userTranscript,
    userMessage,
    calendarEvents,
    calendarConnected,
    'conversational',
  );

  if (emotionalRoute) {
    return emotionalRoute;
  }

  logTurnPipeline('route selected', {
    route: 'llm',
    plannerExecution: 'streamExecutiveChatMessage',
    emotionalFallback: false,
    executionState: 'conversational',
  });

  return {
    route: 'llm',
    intent,
    reply: null,
    intentPrompt: buildIntentPrioritySystemPrompt(intent),
    userTranscript,
    latestUserMessageId: userMessage?.id ?? null,
    executionState: 'conversational',
    operationalStarted: false,
  };
}

export function finalizeTurnReply(
  params: ResolveAssistantTurnParams & { candidateReply: string },
) {
  return guardAgainstRepeatedAssistantResponse({
    messages: params.messages,
    candidateReply: params.candidateReply,
    languageCode: params.languageCode,
    calendarConnected: params.orchestrator.snapshot.calendarConnection?.status === 'connected',
    referenceNow: params.referenceNow,
  });
}

export function shouldFormatReplyForVoice(executionState: AssistantExecutionState) {
  return executionState === 'conversational' || executionState === 'emotional_support';
}
