import type { ChatMessage } from '@/src/entities/chat/types';
import {
  isEmotionalEmptyDayFallback,
  logFallbackActivation,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import { blockConversationalCalendarRetryLoop } from '@/src/features/agent/execution/calendarRetryPhraseGuard';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  assertCalendarReplyMatchesTool,
  buildFailureTerminalReply,
  isCalendarMutationSuccessReply,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { getCalendarCommandTerminalReply } from '@/src/features/agent/calendar/calendarCommandExecutor';
import { getLastCalendarCommandOutcome } from '@/src/features/agent/execution/calendarExecutionSession';
import { requiresCalendarToolExecution, enforceCalendarToolReply } from '@/src/features/agent/calendar/calendarToolExecutionGate';
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

  if (!requiresCalendarToolExecution(latestUser.content)) {
    return params.candidateReply;
  }

  return (
    getCalendarCommandTerminalReply(latestUser.content) ??
    buildFailureTerminalReply('CALENDAR_EXECUTION_CONTRACT', 'missing terminal tool reply')
  );
}

export function forceRegenerateOperationalReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
}) {
  if (requiresCalendarToolExecution(params.transcript)) {
    return (
      getCalendarCommandTerminalReply(params.transcript) ??
      buildFailureTerminalReply('CALENDAR_EXECUTION_CONTRACT', 'missing terminal tool reply')
    );
  }

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
    normalized.startsWith('Event created successfully:') ||
    normalized.startsWith('Событие создано успешно:') ||
    normalized.startsWith('Подію створено успішно:') ||
    normalized.startsWith('Event removed successfully:') ||
    normalized.startsWith('Событие удалено успешно:') ||
    normalized.startsWith('Подію видалено успішно:') ||
    normalized.startsWith('Готово.') ||
    normalized.includes('Я додав:') ||
    normalized.includes('Я добавил:') ||
    normalized.includes('Я видалив:') ||
    normalized.includes('Я удалил:') ||
    normalized.includes('I removed:') ||
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
  const isCalendarWrite = requiresCalendarToolExecution(userTranscript);
  const calendarIntent = detectCalendarCommandIntent(userTranscript);

  if (isCalendarWrite || isCalendarMutationSuccessReply(params.candidateReply)) {
    const lastOutcome = getLastCalendarCommandOutcome();
    const terminal =
      getCalendarCommandTerminalReply(userTranscript) ??
      buildFailureTerminalReply('CALENDAR_EXECUTION_CONTRACT', 'missing terminal tool reply');

    const enforced = assertCalendarReplyMatchesTool({
      userTranscript,
      candidateReply: params.candidateReply,
      terminalReply: terminal,
      tool: lastOutcome?.tool ?? null,
      intent: calendarIntent === 'none' ? 'create_calendar_event' : calendarIntent,
    });

    return enforced;
  }

  let reply = blockEmotionalFallbackAfterOperational(params);

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
