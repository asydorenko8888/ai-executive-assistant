import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ChatMessage } from '@/src/entities/chat/types';
import {
  ensureFreshCalendarForAgendaTurn,
  isCalendarAgendaQuery,
} from '@/src/features/agent/calendar/calendarAgendaSync';
import {
  isDeterministicCalendarReadQuery,
  tryBuildDeterministicCalendarReply,
} from '@/src/features/agent/calendarIntelligence';
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
import { detectCalendarCommandIntent, requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import { executeCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExecutor';
import { assertCalendarReplyMatchesTool } from '@/src/features/agent/calendar/calendarExecutionContract';
import { getLastCalendarCommandOutcome, getPendingCalendarUpdateContext, setPendingCalendarUpdateContext } from '@/src/features/agent/execution/calendarExecutionSession';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  logCalendarUpdateClarification,
  logUpdateClarificationStored,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { pendingContextFromExtraction } from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import {
  buildBehaviorModeSystemPrompt,
  resolveAssistantBehavior,
} from '@/src/features/agent/intent/assistantBehaviorRouter';
import type { AssistantBehaviorMode } from '@/src/features/agent/intent/assistantBehaviorRouter';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { processVoiceReminderTranscript } from '@/src/features/reminders/processVoiceReminder';
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
  if (isOperationalCalendarWriteRequest(userTranscript)) {
    logFallbackActivation('emotional route blocked — calendar write must execute', {
      userTranscript: userTranscript.slice(0, 120),
    });
    return null;
  }

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

    if (!isDeterministicCalendarReadQuery(userTranscript)) {
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
  const behavior = resolveAssistantBehavior({
    transcript: userTranscript,
    messages: params.messages,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    intent,
  });
  const actionTranscript = behavior.actionTranscript;
  const calendarCommandIntent = detectCalendarCommandIntent(actionTranscript);
  const operationalStarted = behavior.mode === 'ACTION_MODE' || behavior.mode === 'CLARIFICATION_MODE';
  const factualGrounding = buildFactualGroundingContext({
    orchestrator: params.orchestrator,
    languageCode: params.languageCode,
    userTranscript,
  });
  const modeDefaults = resolutionDefaults(factualGrounding);
  const behaviorPrompt = buildBehaviorModeSystemPrompt(behavior.mode);

  logTurnPipeline('behavior mode', {
    mode: behavior.mode,
    intent: behavior.intent,
    reason: behavior.reason,
    selectedTool: behavior.selectedTool,
    missingFields: behavior.missingFields,
    actionTranscriptPreview: actionTranscript.slice(0, 120),
  });
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

  const { refreshCalendarAuthCapabilities } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  const calendarAuth = await refreshCalendarAuthCapabilities({ heal: true });
  const calendarConnected = calendarAuth.canReadCalendar;
  const calendarEvents = await ensureFreshCalendarForAgendaTurn({
    orchestrator: params.orchestrator,
    referenceNow: params.referenceNow,
    userTranscript,
    calendarConnected,
  });
  const suppressCalendarAgendaMemory =
    isCalendarAgendaQuery(userTranscript) || isDeterministicCalendarReadQuery(userTranscript);

  if (isDeterministicCalendarReadQuery(userTranscript) && calendarConnected && !getPendingCalendarUpdateContext()) {
    const deterministicCalendarReply = await tryBuildDeterministicCalendarReply({
      transcript: userTranscript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      calendarConnected,
      prefetchedEvents: calendarEvents,
    });

    if (deterministicCalendarReply) {
      logTurnPipeline('route selected', {
        route: 'advisory_local',
        behaviorMode: behavior.mode,
        deterministicCalendar: true,
        exactTimeRead: true,
      });

      return {
        route: 'advisory_local',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: deterministicCalendarReply,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'conversational',
        operationalStarted: false,
        responseMode: 'factual',
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: 'none',
      };
    }
  }

  if (
    behavior.mode === 'CLARIFICATION_MODE' &&
    behavior.clarificationReply &&
    !isDeterministicCalendarReadQuery(userTranscript)
  ) {
    if (behavior.intent === 'update_calendar_event') {
      const extracted = extractCalendarUpdateParameters(actionTranscript, params.referenceNow);
      const pendingContext = pendingContextFromExtraction({
        sourceTranscript: actionTranscript,
        extraction: extracted,
      });
      setPendingCalendarUpdateContext(pendingContext);
      logUpdateClarificationStored({
        title: pendingContext.title,
        fromTime: pendingContext.fromTime,
        toTime: pendingContext.toTime,
        missingFields: extracted.missingFields,
        sourceTranscriptPreview: actionTranscript.slice(0, 160),
      });
      logCalendarUpdateClarification({
        missingFields: behavior.missingFields,
        actionTranscriptPreview: actionTranscript.slice(0, 160),
        clarificationReplyPreview: behavior.clarificationReply.slice(0, 160),
      });
    }

    logTurnPipeline('route selected', {
      route: 'clarification_local',
      behaviorMode: behavior.mode,
      missingFields: behavior.missingFields,
      blockLlm: true,
    });

    return {
      route: 'clarification_local',
      intent,
      reply: behavior.clarificationReply,
      intentPrompt: behaviorPrompt,
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'tool_call',
      operationalStarted: true,
      spokenReply: behavior.clarificationReply,
      calendarVerified: false,
      responseMode: 'operational',
      factualGroundingStatus: factualGrounding.snapshot.status,
      behaviorMode: behavior.mode,
      selectedTool: behavior.selectedTool,
    };
  }

  if (behavior.mode === 'ACTION_MODE' && behavior.selectedTool === 'create_reminder') {
    const reminderResult = await processVoiceReminderTranscript({
      transcript: actionTranscript,
      languageCode: params.languageCode,
    });

    if (reminderResult) {
      logTurnPipeline('route selected', {
        route: 'operational_local',
        behaviorMode: behavior.mode,
        selectedTool: 'create_reminder',
        blockLlm: true,
      });

      return {
        route: 'operational_local',
        intent,
        reply: reminderResult.confirmation,
        intentPrompt: behaviorPrompt,
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'tool_success',
        operationalStarted: true,
        spokenReply: reminderResult.confirmation,
        calendarVerified: false,
        responseMode: 'operational',
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: behavior.selectedTool,
      };
    }
  }

  if (behavior.mode === 'ACTION_MODE' && requiresCalendarCommandExecution(actionTranscript)) {
    logTurnPipeline('calendar command executor — tool-first', {
      behaviorMode: behavior.mode,
      intent: calendarCommandIntent,
      transcriptPreview: actionTranscript.slice(0, 120),
    });

    const commandResult = await executeCalendarCommand({
      transcript: actionTranscript,
      titleSourceTranscript: userTranscript,
      languageCode: params.languageCode,
      calendarConnected,
      referenceNow: params.referenceNow,
    });

    const lastOutcome = getLastCalendarCommandOutcome();
    const calendarReply = assertCalendarReplyMatchesTool({
      userTranscript: actionTranscript,
      candidateReply: commandResult.reply,
      terminalReply: commandResult.reply,
      tool: lastOutcome?.tool ?? null,
      intent: calendarCommandIntent === 'none' ? 'create_calendar_event' : calendarCommandIntent,
    });

    logTurnPipeline('route selected', {
      route: 'operational_local',
      behaviorMode: behavior.mode,
      intent: calendarCommandIntent,
      toolStatus: commandResult.toolStatus,
      emotionalFallback: false,
      blockLlm: true,
      eventId: commandResult.eventId ?? null,
    });

    return {
      route: 'operational_local',
      intent,
      reply: calendarReply,
      intentPrompt: behaviorPrompt,
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: commandResult.executionState,
      operationalStarted: true,
      requiresCalendarAuth: commandResult.requiresCalendarAuth,
      spokenReply: commandResult.spokenReply,
      calendarVerified: commandResult.verified,
      responseMode: 'operational',
      factualGroundingStatus: factualGrounding.snapshot.status,
      behaviorMode: behavior.mode,
      selectedTool: behavior.selectedTool,
    };
  }

  if (behavior.mode === 'ADVISORY_MODE') {
    if (isTemporalFactualQuery(userTranscript)) {
      const factualReply = tryBuildFactualTimeReply({
        transcript: userTranscript,
        snapshot: factualGrounding.snapshot,
        languageCode: params.languageCode,
      });

      if (factualReply) {
        logTurnPipeline('route selected', {
          route: 'advisory_local',
          behaviorMode: behavior.mode,
          emotionalFallback: false,
          responseMode: 'factual',
        });

        return {
          route: 'advisory_local',
          intent,
          reply: guardAgainstRepeatedAssistantResponse({
            messages: params.messages,
            candidateReply: factualReply,
            languageCode: params.languageCode,
            calendarConnected,
            referenceNow: params.referenceNow,
          }),
          intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
          userTranscript,
          latestUserMessageId: userMessage?.id ?? null,
          executionState: 'conversational',
          operationalStarted: false,
          responseMode: 'factual',
          factualGroundingStatus: factualGrounding.snapshot.status,
          behaviorMode: behavior.mode,
          selectedTool: 'none',
        };
      }
    }

    const deterministicCalendarReply = await tryBuildDeterministicCalendarReply({
      transcript: userTranscript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      calendarConnected,
      prefetchedEvents: calendarEvents,
    });

    if (deterministicCalendarReply) {
      logTurnPipeline('route selected', {
        route: 'advisory_local',
        behaviorMode: behavior.mode,
        emotionalFallback: false,
        deterministicCalendar: true,
      });

      return {
        route: 'advisory_local',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: deterministicCalendarReply,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'conversational',
        operationalStarted: false,
        responseMode: 'factual',
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: 'none',
      };
    }

    const sessionContext = buildVoiceSessionContext(
      buildVoiceSessionMemoryFromMessages(params.messages),
    );
    const humanizedReply = tryBuildHumanizedCalendarReply({
      transcript: userTranscript,
      visibleEvents: calendarEvents,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      sessionContext: suppressCalendarAgendaMemory ? null : sessionContext,
    });

    if (humanizedReply) {
      logTurnPipeline('route selected', {
        route: 'advisory_local',
        behaviorMode: behavior.mode,
        emotionalFallback: false,
      });

      return {
        route: 'advisory_local',
        intent,
        reply: guardAgainstRepeatedAssistantResponse({
          messages: params.messages,
          candidateReply: humanizedReply.responseText,
          languageCode: params.languageCode,
          calendarConnected,
          referenceNow: params.referenceNow,
        }),
        intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'conversational',
        operationalStarted: false,
        responseMode: 'factual',
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: 'none',
      };
    }

    logTurnPipeline('route selected', {
      route: 'llm',
      behaviorMode: behavior.mode,
      plannerExecution: 'streamExecutiveChatMessage',
      blockCalendarMutation: true,
    });

    return {
      route: 'llm',
      intent,
      reply: null,
      intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'conversational',
      operationalStarted: false,
      responseMode: 'factual',
      factualGroundingStatus: factualGrounding.snapshot.status,
      behaviorMode: behavior.mode,
      selectedTool: 'none',
    };
  }

  if (behavior.mode === 'ACTION_MODE') {
    const locale = params.languageCode === 'ru-RU' ? 'ru' : params.languageCode === 'uk-UA' ? 'uk' : 'en';
    const terminalReply =
      locale === 'ru'
        ? 'FAILURE: ACTION_MODE: не удалось выполнить запрошенное действие.'
        : locale === 'uk'
          ? 'FAILURE: ACTION_MODE: не вдалося виконати запитану дію.'
          : 'FAILURE: ACTION_MODE: could not execute the requested action.';

    logTurnPipeline('route selected', {
      route: 'operational_local',
      behaviorMode: behavior.mode,
      blockLlm: true,
    });

    return {
      route: 'operational_local',
      intent,
      reply: terminalReply,
      spokenReply: terminalReply,
      intentPrompt: behaviorPrompt,
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'tool_failure',
      operationalStarted: true,
      responseMode: 'operational',
      factualGroundingStatus: factualGrounding.snapshot.status,
      behaviorMode: behavior.mode,
      selectedTool: behavior.selectedTool,
    };
  }

  if (behavior.mode !== 'COMPANION_MODE') {
    logTurnPipeline('route selected', {
      route: 'llm',
      behaviorMode: behavior.mode,
      plannerExecution: 'streamExecutiveChatMessage',
    });

    return {
      route: 'llm',
      intent,
      reply: null,
      intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'conversational',
      operationalStarted: false,
      ...modeDefaults,
      behaviorMode: behavior.mode,
      selectedTool: behavior.selectedTool,
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
    behaviorMode: behavior.mode,
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
    return {
      ...emotionalRoute,
      behaviorMode: behavior.mode,
      intentPrompt: [behaviorPrompt, emotionalRoute.intentPrompt].filter(Boolean).join(' '),
    };
  }

  logTurnPipeline('route selected', {
    route: 'llm',
    behaviorMode: behavior.mode,
    plannerExecution: 'streamExecutiveChatMessage',
    emotionalFallback: false,
    executionState: 'conversational',
  });

  return {
    route: 'llm',
    intent,
    reply: null,
    intentPrompt: [behaviorPrompt, buildIntentPrioritySystemPrompt(intent)].filter(Boolean).join(' '),
    userTranscript,
    latestUserMessageId: userMessage?.id ?? null,
    executionState: 'conversational',
    operationalStarted: false,
    behaviorMode: behavior.mode,
    selectedTool: behavior.selectedTool,
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
    calendarConnected:
      params.orchestrator.snapshot.calendarConnection?.status === 'connected',
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
