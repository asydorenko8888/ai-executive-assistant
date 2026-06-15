import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ChatMessage } from '@/src/entities/chat/types';
import {
  ensureFreshCalendarForAgendaTurn,
  isCalendarAgendaQuery,
} from '@/src/features/agent/calendar/calendarAgendaSync';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { isAwaitingEventDisambiguationSelectionReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { tryBuildCalendarReadReply } from '@/src/features/agent/calendar/calendarReadReplyBuilder';
import {
  isDeterministicCalendarReadQuery,
  tryBuildDeterministicCalendarReply,
} from '@/src/features/agent/calendarIntelligence';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import { tryBuildHumanizedCalendarReply } from '@/src/features/agent/calendar/calendarHumanizedReply';
import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import {
  logAssistantReplyGenerated,
  logCalendarPipelineEntered,
  logRouterSelectedIntent,
} from '@/src/features/agent/conversation/assistantRoutingMarkers';
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
import { buildActionModeFailureReply } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import {
  detectCalendarCommandIntent,
  requiresCalendarCommandExecution,
  type CalendarCommandKind,
} from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  logCalendarExecutionBlocked,
  logCalendarMoveExecutionGate,
  logCalendarMoveIntentDetected,
  logCalendarMovePipelineTurn,
  logCalendarMoveRequiresExecution,
} from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import { ensureVisibleCalendarMoveReply, buildCalendarExecutionBlockedReply } from '@/src/features/agent/calendar/calendarMoveExceptionReply';
import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import { executeCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExecutor';
import { assertCalendarReplyMatchesTool } from '@/src/features/agent/calendar/calendarExecutionContract';
import { getLastCalendarCommandOutcome, getPendingCalendarUpdateContext, setPendingCalendarUpdateContext, clearLastCalendarCommandOutcomeIfTranscriptChanged } from '@/src/features/agent/execution/calendarExecutionSession';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  logCalendarUpdateClarification,
  logUpdateClarificationStored,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import {
  getCalendarConversationSnapshot,
  isAwaitingCalendarConflictResolution,
  isCalendarConflictDecisionState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { syncConversationStateForMoveClarification } from '@/src/features/agent/calendar/calendarConversationSync';
import { pendingContextFromExtraction } from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import {
  syncAssistantContextFromCalendarMemory,
} from '@/src/features/agent/conversation/activeConversationalReference';
import {
  buildBehaviorModeSystemPrompt,
  resolveAssistantBehavior,
} from '@/src/features/agent/intent/assistantBehaviorRouter';
import type { AssistantBehaviorMode } from '@/src/features/agent/intent/assistantBehaviorRouter';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  classifyLocalAlarmIntentKind,
  isLocalAlarmCreateQuery,
  isLocalAlarmIntent,
  shouldRouteToLocalAlarmWorkflow,
} from '@/src/features/local-alarms/localAlarmClassification';
import {
  shouldBlockLocalAlarmRoutingForContextFollowUp,
} from '@/src/features/agent/conversation/activeConversationalReference';
import {
  detectAlarmPipelineIntent,
  logAlarmRoutingDiagnostic,
} from '@/src/features/local-alarms/localAlarmRouting';
import { hasPendingLocalAlarmAction, hasPendingAlarmSelection, resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';
import {
  isLocalReminderCreateQuery,
  isLocalReminderIntent,
} from '@/src/features/local-reminders/localReminderClassification';
import { resolveLocalReminderTurn } from '@/src/features/local-reminders/resolveLocalReminderTurn';
import { processVoiceReminderTranscript } from '@/src/features/reminders/processVoiceReminder';
import { guardAgainstRepeatedAssistantResponse, getLatestUserMessage } from '@/src/features/agent/conversation/assistantResponseGuard';
import {
  buildPostActionAcknowledgmentReply,
  isPostActionAcknowledgmentTurn,
  logPostActionAcknowledgment,
} from '@/src/features/agent/conversation/postActionAcknowledgmentReply';
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

function buildGuardedCalendarTimeUntilReply(params: {
  transcript: string;
  events: CalendarEvent[];
  messages: ChatMessage[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
}) {
  if (!params.calendarConnected || !isCalendarTimeUntilEventQuery(params.transcript)) {
    return null;
  }

  const reply = tryBuildCalendarTimeUntilReplyFromEvents({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    events: params.events,
  });

  if (!reply) {
    return null;
  }

  return guardAgainstRepeatedAssistantResponse({
    messages: params.messages,
    candidateReply: reply,
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });
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
      const timeUntilReply = buildGuardedCalendarTimeUntilReply({
        transcript: userTranscript,
        events: calendarEvents,
        messages: params.messages,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        calendarConnected,
      });

      if (timeUntilReply) {
        if (
          !assertExecutionTransition({ from: fromState, to: 'emotional_support', reason: 'calendar_time_until' })
        ) {
          return null;
        }

        logFallbackActivation('calendar_time_until', { fromState });

        return {
          route: 'advisory_local',
          intent,
          reply: timeUntilReply,
          intentPrompt: buildIntentPrioritySystemPrompt(intent),
          userTranscript,
          latestUserMessageId: userMessage?.id ?? null,
          executionState: 'conversational',
          operationalStarted: false,
          responseMode: 'factual',
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

function buildLocalAlarmParseFailureReply(languageCode: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    return 'Не зрозумів, коли поставити будильник.';
  }

  if (languageCode === 'ru-RU') {
    return 'Не понял, когда поставить будильник.';
  }

  return 'I did not understand when to set the alarm.';
}

function tryResolveLocalAlarmTurn(params: {
  userTranscript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  intent: AssistantIntentAnalysis;
  behaviorPrompt: string | null;
  userMessage: ChatMessage | null;
  factualGrounding: ReturnType<typeof buildFactualGroundingContext>;
  behaviorMode: AssistantBehaviorMode;
  selectedTool: string;
}): AssistantTurnResolution | null {
  if (shouldBlockLocalAlarmRoutingForContextFollowUp(params.userTranscript)) {
    return null;
  }

  if (!shouldRouteToLocalAlarmWorkflow(params.userTranscript) && !hasPendingLocalAlarmAction()) {
    return null;
  }

  const localResult = resolveLocalAlarmTurn({
    transcript: params.userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (!localResult) {
    if (hasPendingAlarmSelection()) {
      return null;
    }

    if (!shouldRouteToLocalAlarmWorkflow(params.userTranscript) && !hasPendingLocalAlarmAction()) {
      return null;
    }

    const clarificationReply = buildLocalAlarmParseFailureReply(params.languageCode);

    logTurnPipeline('route selected', {
      route: 'clarification_local',
      behaviorMode: params.behaviorMode,
      selectedTool: 'create_reminder',
      localAlarm: true,
      blockLlm: true,
    });

    return {
      route: 'clarification_local',
      intent: params.intent,
      reply: clarificationReply,
      intentPrompt: params.behaviorPrompt,
      userTranscript: params.userTranscript,
      latestUserMessageId: params.userMessage?.id ?? null,
      executionState: 'tool_call',
      operationalStarted: true,
      spokenReply: clarificationReply,
      calendarVerified: false,
      ...resolutionDefaults(params.factualGrounding),
      behaviorMode: params.behaviorMode,
      selectedTool: params.selectedTool,
    };
  }

  logTurnPipeline('route selected', {
    route: 'operational_local',
    behaviorMode: params.behaviorMode,
    selectedTool: 'create_reminder',
    localAlarm: true,
    blockLlm: true,
  });

  return {
    route: 'operational_local',
    intent: params.intent,
    reply: localResult.reply,
    intentPrompt: params.behaviorPrompt,
    userTranscript: params.userTranscript,
    latestUserMessageId: params.userMessage?.id ?? null,
    executionState: 'tool_success',
    operationalStarted: true,
    spokenReply: localResult.spokenReply ?? localResult.reply,
    calendarVerified: false,
    ...resolutionDefaults(params.factualGrounding),
    behaviorMode: params.behaviorMode,
    selectedTool: params.selectedTool,
  };
}

function buildLocalReminderParseFailureReply(languageCode: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    return 'Не зрозумів, коли нагадати.';
  }

  if (languageCode === 'ru-RU') {
    return 'Не понял, когда напомнить.';
  }

  return 'I did not understand when to remind you.';
}

function tryResolveLocalReminderTurn(params: {
  userTranscript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  intent: AssistantIntentAnalysis;
  behaviorPrompt: string | null;
  userMessage: ChatMessage | null;
  factualGrounding: ReturnType<typeof buildFactualGroundingContext>;
  behaviorMode: AssistantBehaviorMode;
  selectedTool: string;
}): AssistantTurnResolution | null {
  if (shouldRouteToLocalAlarmWorkflow(params.userTranscript)) {
    return null;
  }

  if (!isLocalReminderIntent(params.userTranscript)) {
    return null;
  }

  const localResult = resolveLocalReminderTurn({
    transcript: params.userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (!localResult) {
    if (!isLocalReminderCreateQuery(params.userTranscript)) {
      return null;
    }

    const clarificationReply = buildLocalReminderParseFailureReply(params.languageCode);

    logTurnPipeline('route selected', {
      route: 'clarification_local',
      behaviorMode: params.behaviorMode,
      selectedTool: 'create_reminder',
      localReminder: true,
      blockLlm: true,
    });

    return {
      route: 'clarification_local',
      intent: params.intent,
      reply: clarificationReply,
      intentPrompt: params.behaviorPrompt,
      userTranscript: params.userTranscript,
      latestUserMessageId: params.userMessage?.id ?? null,
      executionState: 'tool_call',
      operationalStarted: true,
      spokenReply: clarificationReply,
      calendarVerified: false,
      ...resolutionDefaults(params.factualGrounding),
      behaviorMode: params.behaviorMode,
      selectedTool: params.selectedTool,
    };
  }

  logTurnPipeline('route selected', {
    route: 'operational_local',
    behaviorMode: params.behaviorMode,
    selectedTool: 'create_reminder',
    localReminder: true,
    blockLlm: true,
  });

  return {
    route: 'operational_local',
    intent: params.intent,
    reply: localResult.reply,
    intentPrompt: params.behaviorPrompt,
    userTranscript: params.userTranscript,
    latestUserMessageId: params.userMessage?.id ?? null,
    executionState: 'tool_success',
    operationalStarted: true,
    spokenReply: localResult.spokenReply ?? localResult.reply,
    calendarVerified: false,
    ...resolutionDefaults(params.factualGrounding),
    behaviorMode: params.behaviorMode,
    selectedTool: params.selectedTool,
  };
}

async function tryResolveCalendarReadTurn(params: {
  userTranscript: string;
  messages: ChatMessage[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
  calendarEvents: CalendarEvent[];
  intent: AssistantIntentAnalysis;
  behaviorPrompt: string | null;
  userMessage: ChatMessage | null;
  factualGroundingStatus: FactualGroundingStatus;
  behaviorMode: AssistantBehaviorMode;
}): Promise<AssistantTurnResolution | null> {
  if (
    !params.calendarConnected ||
    isAwaitingEventDisambiguationSelectionReply(params.userTranscript, params.referenceNow) ||
    !isCalendarReadOnlyQuery(params.userTranscript, params.referenceNow)
  ) {
    return null;
  }

  const readReply = await tryBuildCalendarReadReply({
    transcript: params.userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    calendarConnected: params.calendarConnected,
    prefetchedEvents: params.calendarEvents,
  });

  if (!readReply?.trim()) {
    return null;
  }

  syncAssistantContextFromCalendarMemory(params.referenceNow);

  logTurnPipeline('route selected', {
    route: 'advisory_local',
    behaviorMode: params.behaviorMode,
    calendarReadOnly: true,
    transcriptPreview: params.userTranscript.slice(0, 120),
  });

  return {
    route: 'advisory_local',
    intent: params.intent,
    reply: guardAgainstRepeatedAssistantResponse({
      messages: params.messages,
      candidateReply: readReply,
      languageCode: params.languageCode,
      calendarConnected: params.calendarConnected,
      referenceNow: params.referenceNow,
    }),
    intentPrompt: [params.behaviorPrompt, buildIntentPrioritySystemPrompt(params.intent)]
      .filter(Boolean)
      .join(' '),
    userTranscript: params.userTranscript,
    latestUserMessageId: params.userMessage?.id ?? null,
    executionState: 'conversational',
    operationalStarted: false,
    responseMode: 'factual',
    factualGroundingStatus: params.factualGroundingStatus,
    behaviorMode: params.behaviorMode,
    selectedTool: 'none',
  };
}

async function tryExecuteReadyCalendarMutation(params: {
  actionTranscript: string;
  userTranscript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
  behaviorMode: AssistantBehaviorMode;
  calendarCommandIntent: CalendarCommandKind;
  selectedTool: string;
  intent: AssistantIntentAnalysis;
  behaviorPrompt: string | null;
  userMessage: ChatMessage | null;
  factualGroundingStatus: FactualGroundingStatus;
}): Promise<AssistantTurnResolution | null> {
  const requiresExecution = requiresCalendarCommandExecution(params.actionTranscript);

  logCalendarMoveRequiresExecution({
    allowed: requiresExecution,
    transcript: params.actionTranscript,
    reason: requiresExecution ? 'calendar_write_or_pending_follow_up' : 'not_calendar_command',
  });

  if (params.calendarCommandIntent === 'none' || !requiresExecution) {
    logCalendarMoveExecutionGate({
      allowed: false,
      blockedBy: params.calendarCommandIntent === 'none' ? 'no_calendar_intent' : 'requires_execution_false',
      intent: params.calendarCommandIntent,
      behaviorMode: params.behaviorMode,
      transcript: params.actionTranscript,
    });
    return null;
  }

  const conversationSnapshot = getCalendarConversationSnapshot();

  if (
    isAwaitingCalendarConflictResolution() ||
    isCalendarConflictDecisionState(conversationSnapshot.state)
  ) {
    logCalendarMoveExecutionGate({
      allowed: false,
      blockedBy: 'awaiting_conflict_confirmation',
      intent: params.calendarCommandIntent,
      behaviorMode: params.behaviorMode,
      transcript: params.actionTranscript,
    });
    return null;
  }

  logCalendarMoveIntentDetected({
    intent: params.calendarCommandIntent,
    transcript: params.actionTranscript,
    source: 'assistantTurnPipeline',
  });

  clearLastCalendarCommandOutcomeIfTranscriptChanged(params.actionTranscript);

  logCalendarMoveExecutionGate({
    allowed: true,
    blockedBy: null,
    intent: params.calendarCommandIntent,
    behaviorMode: params.behaviorMode,
    transcript: params.actionTranscript,
  });

  logTurnPipeline('calendar command executor — tool-first', {
    behaviorMode: params.behaviorMode,
    intent: params.calendarCommandIntent,
    transcriptPreview: params.actionTranscript.slice(0, 120),
    route: 'ready_mutation_early',
  });

  const commandResult = await executeCalendarCommand({
    transcript: params.actionTranscript,
    titleSourceTranscript: params.userTranscript,
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });

  const lastOutcome = getLastCalendarCommandOutcome();
  const guardEmptyReply = (reply: string, reason: string) => {
    if (reply.trim()) {
      return reply;
    }

    if (params.calendarCommandIntent === 'update_calendar_event') {
      return ensureVisibleCalendarMoveReply({
        reply,
        languageCode: params.languageCode,
        fallbackReason: reason,
      });
    }

    return buildFailureTerminalReply('CALENDAR_EXECUTION_CONTRACT', reason);
  };

  const visibleCommandReply = guardEmptyReply(
    commandResult.reply,
    'календарная команда не вернула ответ',
  );

  const calendarReply = assertCalendarReplyMatchesTool({
    userTranscript: params.actionTranscript,
    candidateReply: visibleCommandReply,
    terminalReply: visibleCommandReply,
    tool: lastOutcome?.tool ?? null,
    intent: params.calendarCommandIntent,
  });

  const resolvedCalendarReply = guardEmptyReply(
    calendarReply,
    'пустой ответ после проверки календарного контракта',
  );

  logTurnPipeline('route selected', {
    route: 'operational_local',
    behaviorMode: params.behaviorMode,
    intent: params.calendarCommandIntent,
    toolStatus: commandResult.toolStatus,
    emotionalFallback: false,
    blockLlm: true,
    eventId: commandResult.eventId ?? null,
    readyMutationEarly: true,
  });

  return {
    route: 'operational_local',
    intent: params.intent,
    reply: resolvedCalendarReply,
    intentPrompt: params.behaviorPrompt ?? '',
    userTranscript: params.userTranscript,
    latestUserMessageId: params.userMessage?.id ?? null,
    executionState: commandResult.executionState,
    operationalStarted: true,
    requiresCalendarAuth: commandResult.requiresCalendarAuth,
    spokenReply: guardEmptyReply(commandResult.spokenReply, resolvedCalendarReply),
    calendarVerified: commandResult.verified,
    responseMode: 'operational',
    factualGroundingStatus: params.factualGroundingStatus,
    behaviorMode: params.behaviorMode,
    selectedTool: params.selectedTool,
  };
}

export async function resolveAssistantTurn(params: ResolveAssistantTurnParams): Promise<AssistantTurnResolution> {
  const userMessage = getLatestUserMessage(params.messages);
  const userTranscript = userMessage?.content.trim() ?? '';

  logAlarmRoutingDiagnostic({ userText: userTranscript });

  const intent = classifyAssistantIntent(userTranscript);
  const factualGrounding = buildFactualGroundingContext({
    orchestrator: params.orchestrator,
    languageCode: params.languageCode,
    userTranscript,
  });
  const modeDefaults = resolutionDefaults(factualGrounding);

  if (isPostActionAcknowledgmentTurn({ transcript: userTranscript, referenceNow: params.referenceNow })) {
    const reply = buildPostActionAcknowledgmentReply(params.languageCode, userTranscript);

    logPostActionAcknowledgment({ transcript: userTranscript, reply });
    logTurnPipeline('route selected', {
      route: 'advisory_local',
      behaviorMode: 'COMPANION_MODE',
      postActionAcknowledgment: true,
      blockLlm: true,
    });
    logAssistantReplyGenerated({
      source: 'post_action_acknowledgment',
      transcriptPreview: userTranscript,
      replyPreview: reply,
      route: 'advisory_local',
    });

    return {
      route: 'advisory_local',
      intent,
      reply,
      intentPrompt: null,
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: 'conversational',
      operationalStarted: false,
      spokenReply: reply,
      calendarVerified: false,
      ...modeDefaults,
      behaviorMode: 'COMPANION_MODE',
      selectedTool: 'none',
    };
  }

  const preBehaviorAlarmTurn = tryResolveLocalAlarmTurn({
    userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    intent,
    behaviorPrompt: null,
    userMessage,
    factualGrounding,
    behaviorMode: 'ACTION_MODE',
    selectedTool: 'create_reminder',
  });

  if (preBehaviorAlarmTurn) {
    const pipelineIntent = detectAlarmPipelineIntent(userTranscript);
    logAlarmRoutingDiagnostic({
      userText: userTranscript,
      selectedPipeline: pipelineIntent ? `${pipelineIntent}_PIPELINE` : 'ALARM_PIPELINE',
    });

    if (preBehaviorAlarmTurn.reply) {
      logAssistantReplyGenerated({
        source: 'local_alarm',
        transcriptPreview: userTranscript,
        replyPreview: preBehaviorAlarmTurn.reply,
        route: preBehaviorAlarmTurn.route,
      });
    }

    return preBehaviorAlarmTurn;
  }

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

  const localAlarmTurn = tryResolveLocalAlarmTurn({
    userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    intent,
    behaviorPrompt,
    userMessage,
    factualGrounding,
    behaviorMode: behavior.mode,
    selectedTool: behavior.selectedTool,
  });

  if (localAlarmTurn) {
    const pipelineIntent = detectAlarmPipelineIntent(userTranscript);
    logAlarmRoutingDiagnostic({
      userText: userTranscript,
      selectedPipeline: pipelineIntent ? `${pipelineIntent}_PIPELINE` : 'ALARM_PIPELINE',
    });

    logAssistantReplyGenerated({
      source: 'local_alarm',
      transcriptPreview: userTranscript,
      replyPreview: localAlarmTurn.reply ?? '',
      route: localAlarmTurn.route,
    });
    return localAlarmTurn;
  }

  const localReminderTurn = tryResolveLocalReminderTurn({
    userTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    intent,
    behaviorPrompt,
    userMessage,
    factualGrounding,
    behaviorMode: behavior.mode,
    selectedTool: behavior.selectedTool,
  });

  if (localReminderTurn) {
    logAssistantReplyGenerated({
      source: 'local_reminder',
      transcriptPreview: userTranscript,
      replyPreview: localReminderTurn.reply ?? '',
      route: localReminderTurn.route,
    });
    return localReminderTurn;
  }

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

  logCalendarMovePipelineTurn({
    userTranscript,
    actionTranscript,
    behaviorMode: behavior.mode,
  });

  logRouterSelectedIntent({
    transcriptPreview: userTranscript,
    behaviorMode: behavior.mode,
    behaviorIntent: behavior.intent,
    route: 'pending',
    calendarCommandIntent,
    readOnlyCalendar: isCalendarReadOnlyQuery(userTranscript),
  });

  const deferCalendarForAlarm =
    shouldRouteToLocalAlarmWorkflow(userTranscript) ||
    shouldRouteToLocalAlarmWorkflow(actionTranscript) ||
    hasPendingLocalAlarmAction() ||
    hasPendingAlarmSelection();

  if (
    !deferCalendarForAlarm &&
    (isCalendarReadOnlyQuery(userTranscript) ||
      requiresCalendarCommandExecution(actionTranscript) ||
      calendarCommandIntent !== 'none')
  ) {
    logCalendarPipelineEntered({
      stage: 'resolve_turn',
      transcriptPreview: userTranscript,
      behaviorMode: behavior.mode,
    });
  }

  const calendarReadTurn = deferCalendarForAlarm
    ? null
    : await tryResolveCalendarReadTurn({
        userTranscript,
        messages: params.messages,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        calendarConnected,
        calendarEvents,
        intent,
        behaviorPrompt,
        userMessage,
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
      });

  if (calendarReadTurn) {
    logAssistantReplyGenerated({
      source: 'calendar_read',
      transcriptPreview: userTranscript,
      replyPreview: calendarReadTurn.reply ?? '',
      route: calendarReadTurn.route,
    });
    return calendarReadTurn;
  }

  const readyCalendarMutation = deferCalendarForAlarm
    ? null
    : await tryExecuteReadyCalendarMutation({
        actionTranscript,
        userTranscript,
        languageCode: params.languageCode,
        calendarConnected,
        referenceNow: params.referenceNow,
        behaviorMode: behavior.mode,
        calendarCommandIntent,
        selectedTool: behavior.selectedTool,
        intent,
        behaviorPrompt,
        userMessage,
        factualGroundingStatus: factualGrounding.snapshot.status,
      });

  if (readyCalendarMutation) {
    return readyCalendarMutation;
  }

  if (isDeterministicCalendarReadQuery(userTranscript) && calendarConnected) {
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
    !deferCalendarForAlarm &&
    behavior.mode === 'CLARIFICATION_MODE' &&
    behavior.clarificationReply &&
    !isDeterministicCalendarReadQuery(userTranscript) &&
    !hasPendingAlarmSelection()
  ) {
    if (behavior.intent === 'update_calendar_event') {
      const extracted = extractCalendarUpdateParameters(actionTranscript, params.referenceNow);
      const pendingContext = pendingContextFromExtraction({
        sourceTranscript: actionTranscript,
        extraction: extracted,
      });
      setPendingCalendarUpdateContext(pendingContext);
      syncConversationStateForMoveClarification(pendingContext, params.languageCode);
      logUpdateClarificationStored({
        title: pendingContext.title,
        fromStartISO: pendingContext.fromStartISO,
        toStartISO: pendingContext.toStartISO,
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
    const alarmTranscript = shouldRouteToLocalAlarmWorkflow(actionTranscript)
      ? actionTranscript
      : shouldRouteToLocalAlarmWorkflow(userTranscript)
        ? userTranscript
        : actionTranscript;

    const localAlarmResult = resolveLocalAlarmTurn({
      transcript: alarmTranscript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    if (localAlarmResult) {
      logTurnPipeline('route selected', {
        route: 'operational_local',
        behaviorMode: behavior.mode,
        selectedTool: 'create_reminder',
        localAlarm: true,
        blockLlm: true,
      });

      return {
        route: 'operational_local',
        intent,
        reply: localAlarmResult.reply,
        intentPrompt: behaviorPrompt,
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'tool_success',
        operationalStarted: true,
        spokenReply: localAlarmResult.spokenReply ?? localAlarmResult.reply,
        calendarVerified: false,
        responseMode: factualGrounding.responseMode,
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: behavior.selectedTool,
      };
    }

    if (classifyLocalAlarmIntentKind(actionTranscript) === 'create') {
      const clarificationReply = buildLocalAlarmParseFailureReply(params.languageCode);

      logTurnPipeline('route selected', {
        route: 'clarification_local',
        behaviorMode: behavior.mode,
        selectedTool: 'create_reminder',
        localAlarm: true,
        blockLlm: true,
      });

      return {
        route: 'clarification_local',
        intent,
        reply: clarificationReply,
        intentPrompt: behaviorPrompt,
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'tool_call',
        operationalStarted: true,
        spokenReply: clarificationReply,
        calendarVerified: false,
        responseMode: factualGrounding.responseMode,
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: behavior.selectedTool,
      };
    }

    const localReminderResult = resolveLocalReminderTurn({
      transcript: actionTranscript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });

    if (localReminderResult) {
      logTurnPipeline('route selected', {
        route: 'operational_local',
        behaviorMode: behavior.mode,
        selectedTool: 'create_reminder',
        localReminder: true,
        blockLlm: true,
      });

      return {
        route: 'operational_local',
        intent,
        reply: localReminderResult.reply,
        intentPrompt: behaviorPrompt,
        userTranscript,
        latestUserMessageId: userMessage?.id ?? null,
        executionState: 'tool_success',
        operationalStarted: true,
        spokenReply: localReminderResult.spokenReply ?? localReminderResult.reply,
        calendarVerified: false,
        responseMode: factualGrounding.responseMode,
        factualGroundingStatus: factualGrounding.snapshot.status,
        behaviorMode: behavior.mode,
        selectedTool: behavior.selectedTool,
      };
    }

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

  if (
    behavior.mode === 'ACTION_MODE' &&
    requiresCalendarCommandExecution(actionTranscript) &&
    !isCalendarReadOnlyQuery(userTranscript)
  ) {
    logCalendarPipelineEntered({
      stage: 'mutation_executor',
      transcriptPreview: userTranscript,
      behaviorMode: behavior.mode,
    });

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
    const guardEmptyReply = (reply: string, reason: string) => {
      if (reply.trim()) {
        return reply;
      }

      if (calendarCommandIntent === 'update_calendar_event') {
        return ensureVisibleCalendarMoveReply({
          reply,
          languageCode: params.languageCode,
          fallbackReason: reason,
        });
      }

      return buildFailureTerminalReply('CALENDAR_EXECUTION_CONTRACT', reason);
    };

    const visibleCommandReply = guardEmptyReply(
      commandResult.reply,
      'календарная команда не вернула ответ',
    );

    const calendarReply = assertCalendarReplyMatchesTool({
      userTranscript: actionTranscript,
      candidateReply: visibleCommandReply,
      terminalReply: visibleCommandReply,
      tool: lastOutcome?.tool ?? null,
      intent: calendarCommandIntent === 'none' ? 'create_calendar_event' : calendarCommandIntent,
    });

    const resolvedCalendarReply = guardEmptyReply(
      calendarReply,
      'пустой ответ после проверки календарного контракта',
    );

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
      reply: resolvedCalendarReply,
      intentPrompt: behaviorPrompt,
      userTranscript,
      latestUserMessageId: userMessage?.id ?? null,
      executionState: commandResult.executionState,
      operationalStarted: true,
      requiresCalendarAuth: commandResult.requiresCalendarAuth,
      spokenReply: guardEmptyReply(commandResult.spokenReply, resolvedCalendarReply),
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
        referenceNow: params.referenceNow,
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

    const timeUntilReply = buildGuardedCalendarTimeUntilReply({
      transcript: userTranscript,
      events: calendarEvents,
      messages: params.messages,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      calendarConnected,
    });

    if (timeUntilReply) {
      logTurnPipeline('route selected', {
        route: 'advisory_local',
        behaviorMode: behavior.mode,
        calendarTimeUntil: true,
      });

      return {
        route: 'advisory_local',
        intent,
        reply: timeUntilReply,
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
    const terminalReply = buildActionModeFailureReply(params.languageCode);

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
