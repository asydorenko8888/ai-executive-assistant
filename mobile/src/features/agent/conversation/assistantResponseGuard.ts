import type { ChatMessage } from '@/src/entities/chat/types';
import {
  isEmotionalEmptyDayFallback,
  logFallbackActivation,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import { blockConversationalCalendarRetryLoop } from '@/src/features/agent/execution/calendarRetryPhraseGuard';
import { isSoftCalendarRefusalReply } from '@/src/features/agent/execution/calendarSoftRefusalGuard';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

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

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    return 'Зрозумів календарний запит — без емоційного опису дня. Уточни час і назву зустрічі, якщо потрібно.';
  }

  if (locale === 'ru') {
    return 'Понял календарный запрос — без эмоционального описания дня. Уточни время и название встречи, если нужно.';
  }

  return 'Understood the calendar request — skipping the emotional day summary. Share the time and title if needed.';
}

export function forceRegenerateOperationalReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    return 'Зрозумів — уточни, будь ласка, час і назву події для календаря.';
  }

  if (locale === 'ru') {
    return 'Понял — уточни, пожалуйста, время и название события для календаря.';
  }

  return 'Got it — what time and title should I use for the calendar event?';
}

function isFactualOperationalReply(reply: string) {
  const normalized = reply.trim();

  return (
    normalized.startsWith('Готово.') ||
    normalized.includes('Я додав:') ||
    normalized.includes('Я добавил:') ||
    normalized.startsWith('Done.') ||
    normalized.startsWith('FAILURE:') ||
    normalized.startsWith('PENDING:')
  );
}

export function guardAgainstRepeatedAssistantResponse(params: {
  messages: ChatMessage[];
  candidateReply: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  const latestUser = getLatestUserMessage(params.messages);
  const userTranscript = latestUser?.content.trim() ?? '';
  const isCalendarWrite = isOperationalCalendarWriteRequest(userTranscript);

  let reply = isCalendarWrite
    ? params.candidateReply
    : blockEmotionalFallbackAfterOperational(params);

  if (isCalendarWrite && isSoftCalendarRefusalReply(reply)) {
    logCalendarDecision('reasonForRefusal', {
      reason: 'blocked_soft_llm_refusal',
      preview: reply.slice(0, 120),
    });

    const lastFailure =
      'FAILURE: CALENDAR_SOFT_REFUSAL_BLOCKED: calendar write must use API, not assistant fallback.';

    return lastFailure;
  }

  reply = blockConversationalCalendarRetryLoop({
    userTranscript,
    candidateReply: reply,
  });

  if (isCalendarWrite) {
    return reply;
  }

  if (isFactualOperationalReply(reply)) {
    return reply;
  }

  if (
    !isRepeatedAssistantResponse({
      messages: params.messages,
      candidateReply: reply,
    })
  ) {
    return reply;
  }

  console.error('[Repeated Assistant Response]', {
    latestUserMessage: latestUser?.content?.slice(0, 120),
    repeatedPreview: reply.slice(0, 120),
  });

  return forceRegenerateOperationalReply({
    transcript: userTranscript,
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });
}
