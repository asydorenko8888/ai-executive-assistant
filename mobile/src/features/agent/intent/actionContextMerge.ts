import type { ChatMessage } from '@/src/entities/chat/types';
import { isCalendarConversationAwaitingInput } from '@/src/features/agent/calendar/calendarConversationState';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { tryMergePendingCalendarUpdateReply } from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { isOperationalCalendarUpdateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
  setPendingCalendarDeleteContext,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

const ACTION_CONTINUATION =
  /^(?:please\s+)?(?:так|да|yes|yeah|yep|ok|okay|sure|давай|ага|go ahead|do it|внеси|додай|add it|schedule it)(?:[,.!\s]|$)/iu;

const ACTION_CONTINUATION_WITH_VERB =
  /^(?:please\s+)?(?:так|да|yes|ok|okay|sure|давай|ага)[,.\s!]+(?:внеси|додай|створи|заплануй|add|create|schedule|book|put|insert)/iu;

const CLARIFICATION_ASSISTANT_MARKERS =
  /(?:Уточни|Please confirm|What should I call|На какое время|How should I call|Как назвать|На какой день|На який|Як назвати|several similar events|похожих событ|схожих подій|Which one should I delete|Какое именно удалить|Яку саме видалити|already have|already an event|У вас уже|На это время уже|Do you still want to move|Do you still want to schedule|Всё равно перенести|Усе одно перенести)/i;

export function isActionContinuation(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return ACTION_CONTINUATION_WITH_VERB.test(normalized) || ACTION_CONTINUATION.test(normalized);
}

function getPreviousUserMessage(messages: ChatMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');

  return userMessages.length >= 2 ? userMessages[userMessages.length - 2] : null;
}

function getPreviousAssistantMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
}

function isAssistantClarificationReply(content: string) {
  return CLARIFICATION_ASSISTANT_MARKERS.test(content.trim());
}

export function mergeActionContextFromHistory(params: {
  transcript: string;
  messages: ChatMessage[];
  referenceNow: Date;
}) {
  const normalized = params.transcript.trim();

  if (isCalendarConversationAwaitingInput() && isBareCalendarShortReply(normalized)) {
    return {
      mergedTranscript: normalized,
      usedContext: false,
      contextSource: null,
    };
  }

  const pendingDelete = getPendingCalendarDeleteContext();

  if (pendingDelete) {
    const mergedPendingDelete = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete,
      reply: normalized,
    });

    if (mergedPendingDelete) {
      setPendingCalendarDeleteContext(mergedPendingDelete.context);

      return {
        mergedTranscript: mergedPendingDelete.transcript,
        usedContext: true,
        contextSource: 'pending_delete_clarification' as const,
      };
    }
  }

  const pendingUpdate = getPendingCalendarUpdateContext();

  if (pendingUpdate) {
    const mergedPending = tryMergePendingCalendarUpdateReply({
      pending: pendingUpdate,
      reply: normalized,
      referenceNow: params.referenceNow,
    });

    if (mergedPending) {
      setPendingCalendarUpdateContext(mergedPending.context);

      return {
        mergedTranscript: mergedPending.transcript,
        usedContext: true,
        contextSource: 'pending_update_clarification' as const,
      };
    }
  }

  if (isCalendarConversationAwaitingInput()) {
    return {
      mergedTranscript: normalized,
      usedContext: false,
      contextSource: null,
    };
  }

  if (isActionContinuation(normalized)) {
    const previousUser = getPreviousUserMessage(params.messages);

    if (previousUser?.content.trim()) {
      return {
        mergedTranscript: `${previousUser.content.trim()} ${normalized}`,
        usedContext: true,
        contextSource: 'previous_user' as const,
      };
    }

    const previousAssistant = getPreviousAssistantMessage(params.messages);

    if (previousAssistant?.content.trim()) {
      return {
        mergedTranscript: `${normalized} ${previousAssistant.content.trim()}`,
        usedContext: true,
        contextSource: 'assistant_offer' as const,
      };
    }
  }

  const previousAssistant = getPreviousAssistantMessage(params.messages);
  const previousUser = getPreviousUserMessage(params.messages);

  if (
    previousAssistant?.content.trim() &&
    isAssistantClarificationReply(previousAssistant.content) &&
    previousUser?.content.trim() &&
    isOperationalCalendarUpdateRequest(previousUser.content)
  ) {
    return {
      mergedTranscript: `${previousUser.content.trim()} ${normalized}`,
      usedContext: true,
      contextSource: 'clarification_followup' as const,
    };
  }

  return {
    mergedTranscript: normalized,
    usedContext: false,
    contextSource: null as
      | 'previous_user'
      | 'assistant_offer'
      | 'clarification_followup'
      | 'pending_update_clarification'
      | 'pending_delete_clarification'
      | null,
  };
}
