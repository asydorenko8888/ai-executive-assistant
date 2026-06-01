import type { ChatMessage } from '@/src/entities/chat/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isCalendarAwareQuestion } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import {
  buildClarificationQuestion,
  validateActionFields,
  type ActionRequiredField,
} from '@/src/features/agent/intent/actionFieldValidator';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { mergeActionContextFromHistory, isActionContinuation } from '@/src/features/agent/intent/actionContextMerge';
import type { AssistantIntentAnalysis } from '@/src/features/agent/intent/assistantIntentRouter';
import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isCalendarConversationAwaitingInput } from '@/src/features/agent/calendar/calendarConversationState';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import { getPendingCalendarConflictContext } from '@/src/features/agent/execution/calendarExecutionSession';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type AssistantBehaviorMode =
  | 'ACTION_MODE'
  | 'ADVISORY_MODE'
  | 'COMPANION_MODE'
  | 'CLARIFICATION_MODE';

export type SelectedActionTool =
  | 'create_calendar_event'
  | 'delete_calendar_event'
  | 'update_calendar_event'
  | 'create_reminder'
  | 'none';

export type AssistantBehaviorRoute = {
  mode: AssistantBehaviorMode;
  intent: string;
  reason: string;
  requiredFields: ActionRequiredField[];
  missingFields: ActionRequiredField[];
  selectedTool: SelectedActionTool;
  actionTranscript: string;
  clarificationReply: string | null;
  blockEmotionalRouting: boolean;
  blockCalendarMutation: boolean;
};

const EXPLICIT_ACTION_VERB_AT_START =
  /^(?:please\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй|удали|удалить|видали|видалити|перенеси|перенести|измени|зміни|add|create|schedule|book|put|insert|delete|remove|cancel|update|move|reschedule|remind|reminder|нагадай|напомни)(?:[\s,:-]|$)/iu;

const REMINDER_ACTION =
  /^(?:please\s+)?(?:remind(?:\s+me)?|reminder|нагадай|напомни)(?:[\s,:-]|$)/iu;

const ADVISORY_PATTERNS = [
  /\b(?:do i have time|still have time|am i late|should i move|should i reschedule|what do you think|what(?:'s| is) better)\b/i,
  /\b(?:встигаю|встигну|чи встигаю|чи встигну|хватит\s+времени|успею)\b/i,
  /\b(?:що\s+краще|як\s+думаєш|как\s+думаешь|как\s+ты\s+думаешь|стоит\s+ли)\b/i,
  /\b(?:should i|is it better|worth it|make sense to)\b/i,
];

const COMPANION_PATTERNS = [
  /\b(?:let(?:'s| us)\s+talk|just\s+talk|popizd|попizd|попизд|поговорим|поговорити|я\s+втомився|я\s+устал|мене\s+бісить|меня\s+бесит)\b/i,
  /\b(?:i(?:'m| am)\s+(?:tired|exhausted|stressed|annoyed|frustrated)|need\s+to\s+vent|feeling\s+down)\b/i,
  /\b(?:выдох|поговорим|просто\s+поговорим|поболтаем|поболтаємо)\b/i,
];

function logBehaviorRoute(details: Record<string, unknown>) {
  console.log('[Router] mode', details.mode);
  console.log('[Router] intent', details.intent);
  console.log('[Router] reason', details.reason);
  console.log('[Router] required fields', details.requiredFields);
  console.log('[Router] selected tool', details.selectedTool);
}

function hasExplicitActionVerb(transcript: string) {
  return (
    EXPLICIT_ACTION_VERB_AT_START.test(transcript.trim()) ||
    requiresCalendarCommandExecution(transcript) ||
    REMINDER_ACTION.test(transcript.trim()) ||
    isActionContinuation(transcript)
  );
}

function isAdvisoryQuery(transcript: string) {
  if (hasExplicitActionVerb(transcript)) {
    return false;
  }

  if (isCalendarAwareQuestion(transcript) && !isOperationalCalendarWriteRequest(transcript)) {
    return true;
  }

  return ADVISORY_PATTERNS.some((pattern) => pattern.test(transcript));
}

function isCompanionQuery(transcript: string, intent: AssistantIntentAnalysis) {
  if (hasExplicitActionVerb(transcript) || isAdvisoryQuery(transcript)) {
    return false;
  }

  if (COMPANION_PATTERNS.some((pattern) => pattern.test(transcript))) {
    return true;
  }

  return (
    intent.primary === 'emotional' ||
    (intent.primary === 'conversational' && intent.conversationalConfidence >= 0.35)
  );
}

function resolveSelectedTool(transcript: string): SelectedActionTool {
  const calendarIntent = detectCalendarCommandIntent(transcript);

  if (calendarIntent !== 'none') {
    return calendarIntent;
  }

  if (REMINDER_ACTION.test(transcript.trim()) || /\b(?:remind|reminder|нагадай|напомни)\b/iu.test(transcript)) {
    return 'create_reminder';
  }

  return 'none';
}

export function resolveAssistantBehavior(params: {
  transcript: string;
  messages: ChatMessage[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  intent: AssistantIntentAnalysis;
}): AssistantBehaviorRoute {
  const contextMerge = mergeActionContextFromHistory({
    transcript: params.transcript,
    messages: params.messages,
    referenceNow: params.referenceNow,
  });
  const actionTranscript = contextMerge.mergedTranscript;

  if (
    isCalendarExactTimeReadQuery(params.transcript) ||
    isCalendarExactTimeReadQuery(actionTranscript)
  ) {
    const route: AssistantBehaviorRoute = {
      requiredFields: [],
      missingFields: [],
      selectedTool: 'none',
      actionTranscript,
      clarificationReply: null,
      blockEmotionalRouting: true,
      blockCalendarMutation: true,
      mode: 'ADVISORY_MODE',
      intent: 'calendar_read_at_time',
      reason: 'exact_time_read_query',
    };

    logBehaviorRoute(route);
    return route;
  }

  const explicitAction =
    hasExplicitActionVerb(actionTranscript) ||
    contextMerge.contextSource === 'clarification_followup' ||
    contextMerge.contextSource === 'pending_update_clarification' ||
    contextMerge.contextSource === 'pending_delete_clarification' ||
    Boolean(getPendingCalendarConflictContext()) ||
    isCalendarConversationAwaitingInput() ||
    isBareCalendarShortReply(params.transcript);
  const fieldValidation = validateActionFields({
    transcript: actionTranscript,
    referenceNow: params.referenceNow,
  });
  const selectedTool = resolveSelectedTool(actionTranscript);

  const base = {
    requiredFields: fieldValidation.requiredFields,
    missingFields: fieldValidation.missingFields,
    selectedTool,
    actionTranscript,
    clarificationReply: null as string | null,
    blockEmotionalRouting: false,
    blockCalendarMutation: false,
  };

  if (explicitAction || fieldValidation.actionKind !== 'none') {
    if (!fieldValidation.readyToExecute && fieldValidation.actionKind !== 'none') {
      const clarificationReply = buildClarificationQuestion({
        missingFields: fieldValidation.missingFields,
        languageCode: params.languageCode,
      });

      const route: AssistantBehaviorRoute = {
        ...base,
        mode: 'CLARIFICATION_MODE',
        intent: fieldValidation.actionKind,
        reason: fieldValidation.missingFields.includes('confidence')
          ? 'extraction_confidence_below_threshold'
          : contextMerge.usedContext
            ? 'action_continuation_missing_fields'
            : 'action_intent_missing_fields',
        clarificationReply,
        blockEmotionalRouting: true,
        blockCalendarMutation: true,
      };

      logBehaviorRoute(route);
      return route;
    }

    if (explicitAction || selectedTool !== 'none') {
      const route: AssistantBehaviorRoute = {
        ...base,
        mode: 'ACTION_MODE',
        intent: fieldValidation.actionKind !== 'none' ? fieldValidation.actionKind : selectedTool,
        reason: contextMerge.usedContext
          ? 'explicit_action_with_context_merge'
          : 'explicit_execution_verb',
        blockEmotionalRouting: true,
        blockCalendarMutation: false,
      };

      logBehaviorRoute(route);
      return route;
    }
  }

  if (isAdvisoryQuery(params.transcript)) {
    const route: AssistantBehaviorRoute = {
      ...base,
      mode: 'ADVISORY_MODE',
      intent: 'schedule_advice',
      reason: 'advisory_question_without_execution_verb',
      blockEmotionalRouting: true,
      blockCalendarMutation: true,
    };

    logBehaviorRoute(route);
    return route;
  }

  if (isCompanionQuery(params.transcript, params.intent)) {
    const route: AssistantBehaviorRoute = {
      ...base,
      mode: 'COMPANION_MODE',
      intent: params.intent.primary,
      reason: 'companion_or_emotional_conversation',
      blockEmotionalRouting: false,
      blockCalendarMutation: true,
    };

    logBehaviorRoute(route);
    return route;
  }

  if (params.intent.shouldBypassEmotionalRouting) {
    const route: AssistantBehaviorRoute = {
      ...base,
      mode: 'ADVISORY_MODE',
      intent: params.intent.operationalSubtype ?? 'operational',
      reason: 'operational_intent_without_explicit_action',
      blockEmotionalRouting: true,
      blockCalendarMutation: true,
    };

    logBehaviorRoute(route);
    return route;
  }

  const route: AssistantBehaviorRoute = {
    ...base,
    mode: 'COMPANION_MODE',
    intent: 'general_conversation',
    reason: 'default_companion',
    blockEmotionalRouting: false,
    blockCalendarMutation: true,
  };

  logBehaviorRoute(route);
  return route;
}

export function buildBehaviorModeSystemPrompt(mode: AssistantBehaviorMode) {
  switch (mode) {
    case 'ACTION_MODE':
      return 'BEHAVIOR_MODE: ACTION. Execute the requested tool. No advice, no emotional commentary, no schedule-density refusals. Confirm only after verified tool success.';
    case 'CLARIFICATION_MODE':
      return 'BEHAVIOR_MODE: CLARIFICATION. Ask exactly one concise question for the missing field. Do not guess. Do not execute tools.';
    case 'ADVISORY_MODE':
      return 'BEHAVIOR_MODE: ADVISORY. Read calendar/context, analyze, recommend. You may express concern. Do NOT create, update, or delete calendar events unless the user gives an explicit new execution command this turn.';
    case 'COMPANION_MODE':
      return 'BEHAVIOR_MODE: COMPANION. Warm, human, conversational. No tool execution unless the user switches to an explicit action command.';
    default:
      return null;
  }
}
