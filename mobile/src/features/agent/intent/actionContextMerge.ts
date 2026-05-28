import type { ChatMessage } from '@/src/entities/chat/types';

const ACTION_CONTINUATION =
  /^(?:please\s+)?(?:так|да|yes|yeah|yep|ok|okay|sure|давай|ага|go ahead|do it|внеси|додай|add it|schedule it)(?:[,.!\s]|$)/iu;

const ACTION_CONTINUATION_WITH_VERB =
  /^(?:please\s+)?(?:так|да|yes|ok|okay|sure|давай|ага)[,.\s!]+(?:внеси|додай|створи|заплануй|add|create|schedule|book|put|insert)/iu;

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

export function mergeActionContextFromHistory(params: {
  transcript: string;
  messages: ChatMessage[];
}) {
  const normalized = params.transcript.trim();

  if (!isActionContinuation(normalized)) {
    return {
      mergedTranscript: normalized,
      usedContext: false,
      contextSource: null as 'previous_user' | 'assistant_offer' | null,
    };
  }

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

  return {
    mergedTranscript: normalized,
    usedContext: false,
    contextSource: null,
  };
}
