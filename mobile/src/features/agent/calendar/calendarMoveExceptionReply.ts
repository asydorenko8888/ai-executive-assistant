import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

function shortenReason(reason: string) {
  const normalized = reason.trim().replace(/\s+/g, ' ');

  if (!normalized) {
    return 'неизвестная ошибка';
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function buildCalendarMoveExceptionReply(
  languageCode: VoiceLanguageCode,
  reason: string,
) {
  const shortReason = shortenReason(reason);
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Не вдалося перенести подію: ${shortReason}`;
  }

  if (locale === 'ru') {
    return `Не удалось перенести событие: ${shortReason}`;
  }

  return `Could not move the event: ${shortReason}`;
}

export function ensureVisibleCalendarMoveReply(params: {
  reply: string | null | undefined;
  languageCode: VoiceLanguageCode;
  fallbackReason: string;
}) {
  const normalized = params.reply?.trim() ?? '';

  if (normalized) {
    return normalized;
  }

  return buildCalendarMoveExceptionReply(params.languageCode, params.fallbackReason);
}

export function buildCalendarExecutionBlockedReply(params: {
  languageCode: VoiceLanguageCode;
  reason: string;
  intent: string;
  title?: string | null;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const reason = shortenReason(params.reason);
  const titleSuffix = params.title?.trim() ? ` (${params.title.trim()})` : '';

  if (locale === 'uk') {
    return `Календар: виконання заблоковано${titleSuffix}: ${reason}`;
  }

  if (locale === 'ru') {
    return `Календарь: выполнение заблокировано${titleSuffix}: ${reason}`;
  }

  return `Calendar execution blocked${titleSuffix}: ${reason}`;
}
