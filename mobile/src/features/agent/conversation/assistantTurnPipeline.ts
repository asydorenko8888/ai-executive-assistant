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
import {
  buildFactualGroundingContext,
  type AssistantResponseMode,
  type FactualGroundingStatus,
  isTemporalFactualQuery,
} from '@/src/features/agent/factual/factualTimeGrounding';
import { tryBuildFactualTimeReply } from '@/src/features/agent/factual/factualTimeReply';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
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
  | 'factual_local'
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
  responseMode: AssistantResponseMode,
): AssistantTurnResolution | null {
  if (responseMode === 'factual' || responseMode === 'operational') {
    logFallbackActivation('emotional route blocked — factual/operational mode locked', {
      responseMode,
    });
    return null;
  }

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
        responseMode,
        factualGroundingStatus: 'grounded',
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
        responseMode,
        factualGroundingStatus: 'grounded',
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
        responseMode,
        factualGroundingStatus: 'grounded',
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
        responseMode,
        factualGroundingStatus: 'grounded',
      };
    }
  }

  return null;
}

function resolutionDefaults(
  factualGrounding: ReturnType<typeof buildFactualGroundingContext>,
): Pick<AssistantTurnResolution, 'responseMode' | 'factualGroundingStatus'> {
  return {
    responseMode: factualGrounding.responseMode,
    factualGroundingStatus: factualGrounding.snapshot.status,
  };
}

export async function resolveAssistantTurn(params: ResolveAssistantTurnParams): Promise<AssistantTurnResolution> {
  const userMessage = getLatestUserMessage(params.messages);
  const userTranscript = userMessage?.content.trim() ?? '';
  const intent = classifyAssistantIntent(userTranscript);
  const operationalStarted = isOperationalCalendarWriteRequest(userTranscript);
  const factualGrounding = buildFactualGroundingContext({
    orchestrator: params.orchestrator,
    languageCode: params.languageCode,
    userTranscript,
  });
  const modeDefaults = resolutionDefaults(factualGrounding);

  logTurnPipeline('latest user message', {
    id: userMessage?.id ?? null,
    preview: userTranscript.slice(0, 120),
  });
  logAssistantIntentRouting(userTranscript, intent);
  logTurnPipeline('factual grounding', {
    responseMode: factualGrounding.responseMode,
    temporalQueryLocked: factualGrounding.temporalQueryLocked,
    factualGroundingStatus: factualGrounding.snapshot.status,
    timeSource: factualGrounding.snapshot.source,
    timezone: factualGrounding.snapshot.timezone,
    dayOfWeek: factualGrounding.snapshot.dayOfWeekEn,
  });

  const calendarEvents = getAssistantVisibleCalendarEvents(
    params.orchestrator.snapshot,
    params.referenceNow,
  );
  const calendarConnected =
    params.orchestrator.snapshot.calendarConnection?.status === 'connected';

  if (isOperationalCalendarWriteRequest(userTranscript)) {
    const operationalResult = await tryBuildOperationalIntentReply({
      transcript: userTranscript,
      languageCode: params.languageCode,
      calendarConnected,
      referenceNow: params.referenceNow,
    });

    if (!operationalResult?.reply) {
      logTurnPipeline('calendar tool missing terminal reply — blocking LLM fallback', {
        operationalStarted: true,
      });
    }

    const calendarReply = operationalResult?.reply ?? 'I could not confirm event creation.';
    const guarded = guardAgainstRepeatedAssistantResponse({
      messages: params.messages,
      candidateReply: calendarReply,
      languageCode: params.languageCode,
      calendarConnected,
      referenceNow: params.referenceNow,
    });

    logTurnPipeline('route selected', {
      route: 'operational_local',
      toolStatus: operationalResult?.toolStatus ?? 'FAILURE',
      emotionalFallback: false,
      blockLlm: true,
    });

    return {
      route: 'operational_local',
      intent,
      reply: guarded,
      intentPrompt: buildIntentPrioritySystemPrompt(intent),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: operationalResult?.executionState ?? 'tool_failure',
      operationalStarted: true,
      requiresCalendarAuth: operationalResult?.requiresCalendarAuth,
      operationalUxPhase: operationalResult?.operationalUxPhase,
      pendingActionId: operationalResult?.pendingActionId,
      spokenReply: operationalResult?.spokenReply,
      calendarVerified: operationalResult?.verified,
      ...modeDefaults,
    };
  }

  const operationalResult = await tryBuildOperationalIntentReply({
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
      requiresCalendarAuth: operationalResult.requiresCalendarAuth,
      operationalUxPhase: operationalResult.operationalUxPhase,
      pendingActionId: operationalResult.pendingActionId,
      spokenReply: operationalResult.spokenReply,
      calendarVerified: operationalResult.verified,
      ...modeDefaults,
    };
  }

  if (isTemporalFactualQuery(userTranscript)) {
    const factualReply = tryBuildFactualTimeReply({
      transcript: userTranscript,
      snapshot: factualGrounding.snapshot,
      languageCode: params.languageCode,
    });

    if (factualReply) {
      logTurnPipeline('route selected', {
        route: 'factual_local',
        emotionalFallback: false,
        executionState: 'conversational',
        responseMode: 'factual',
      });

      return {
        route: 'factual_local',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: factualReply,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: buildIntentPrioritySystemPrompt(intent),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'conversational',
        operationalStarted: false,
        responseMode: 'factual',
        factualGroundingStatus: factualGrounding.snapshot.status,
      };
    }
  }

  if (intent.shouldBypassEmotionalRouting || operationalStarted) {
    const locale = params.languageCode === 'ru-RU' ? 'ru' : params.languageCode === 'uk-UA' ? 'uk' : 'en';
    const terminalReply =
      locale === 'ru'
        ? 'Не удалось подтвердить выполнение. Повторную попытку не запускаю.'
        : locale === 'uk'
          ? 'Не вдалося підтвердити виконання. Повторну спробу не запускаю.'
          : 'I could not confirm execution. I am not starting another attempt.';

    logTurnPipeline('route selected', {
      route: 'operational_local',
      plannerExecution: 'terminal_no_llm_operational',
      emotionalFallback: false,
      blockLlm: true,
    });

    return {
      route: 'operational_local',
      intent,
      reply: terminalReply,
      spokenReply: terminalReply,
      intentPrompt: buildIntentPrioritySystemPrompt(intent),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'tool_failure',
      operationalStarted: true,
      ...modeDefaults,
    };
  }

  if (factualGrounding.responseMode === 'factual') {
    logTurnPipeline('route selected', {
      route: 'llm',
      plannerExecution: 'streamExecutiveChatMessage',
      emotionalFallback: false,
      responseMode: 'factual',
      factualGroundingStatus: factualGrounding.snapshot.status,
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
      ...modeDefaults,
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
    factualGrounding.responseMode,
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
    ...modeDefaults,
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

export function shouldFormatReplyForVoice(
  executionState: AssistantExecutionState,
  responseMode?: AssistantResponseMode,
) {
  if (responseMode === 'factual' || responseMode === 'operational') {
    return false;
  }

  return executionState === 'conversational' || executionState === 'emotional_support';
}
