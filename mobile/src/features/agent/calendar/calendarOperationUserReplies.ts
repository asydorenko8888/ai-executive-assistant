import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

/** Shown when a second calendar mutation is attempted while the first is still running. */
export function buildCalendarOperationInProgressReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Календар ще оновлюється. Зачекайте хвилинку.';
  }

  if (locale === 'ru') {
    return 'Календарь ещё обновляется. Подождите немного.';
  }

  return 'Calendar is still updating. Please wait a moment.';
}

export function buildCalendarRefreshFailedReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Не вдалося оновити дані календаря. Спробуйте ще раз.';
  }

  if (locale === 'ru') {
    return 'Не удалось обновить данные календаря. Попробуйте ещё раз.';
  }

  return "I couldn't refresh calendar data. Please try again.";
}
