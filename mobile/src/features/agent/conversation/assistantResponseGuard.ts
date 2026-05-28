import type { ChatMessage } from '@/src/entities/chat/types';
import {
  isEmotionalEmptyDayFallback,
  logFallbackActivation,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { tryBuildOperationalIntentReply } from '@/src/features/agent/intent/operationalIntentReply';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function normalizeReply(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user') ?? null;
}

export function getPreviousUserMessage(messages: ChatMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');

  return userMessages.length >= 2 ? userMessages[userMessages.length - 2] : null;
}

export function getLatestAssistantMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
}

export function isRepeatedAssistantResponse(params: {
  messages: ChatMessage[];
  candidateReply: string;
}) {
  const latestUser = getLatestUserMessage(params.messages);
  const previousUser = getPreviousUserMessage(params.messages);
  const previousAssistant = getLatestAssistantMessage(params.messages);

  if (!latestUser || !previousAssistant) {
    return false;
  }

  if (previousUser && previousUser.content.trim() === latestUser.content.trim()) {
    return false;
  }

  return normalizeReply(previousAssistant.content) === normalizeReply(params.candidateReply);
}

export function blockEmotionalFallbackAfterOperational(params: {
  messages: ChatMessage[];
  candidateReply: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  const latestUser = getLatestUserMessage(params.messages);

  if (!latestUser || !isEmotionalEmptyDayFallback(params.candidateReply)) {
    return params.candidateReply;
  }

  if (!isOperationalCalendarWriteRequest(latestUser.content)) {
    return params.candidateReply;
  }

  logFallbackActivation('Blocked emotional empty-day fallback after operational calendar intent', {
    latestUserMessage: latestUser.content.slice(0, 120),
    blockedPreview: params.candidateReply.slice(0, 120),
  });

  const operational = tryBuildOperationalIntentReply({
    transcript: latestUser.content.trim(),
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });

  return operational?.reply ?? params.candidateReply;
}

export function forceRegenerateOperationalReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  const operational = tryBuildOperationalIntentReply(params);

  if (operational) {
    return operational.reply;
  }

  return 'Got it — let me handle that request directly. What time and title should I use?';
}

export function guardAgainstRepeatedAssistantResponse(params: {
  messages: ChatMessage[];
  candidateReply: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  let reply = blockEmotionalFallbackAfterOperational(params);

  if (
    !isRepeatedAssistantResponse({
      messages: params.messages,
      candidateReply: reply,
    })
  ) {
    return reply;
  }

  const latestUser = getLatestUserMessage(params.messages);

  console.error('[Repeated Assistant Response]', {
    latestUserMessage: latestUser?.content?.slice(0, 120),
    repeatedPreview: reply.slice(0, 120),
  });

  return forceRegenerateOperationalReply({
    transcript: latestUser?.content.trim() ?? '',
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });
}
