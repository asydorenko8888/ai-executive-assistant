import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

export function buildCalendarMutationUnchangedFailureReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Не вдалося виконати дію. Календар не змінено.';
  }

  if (locale === 'ru') {
    return 'Не удалось выполнить действие. Календарь не изменён.';
  }

  return 'Could not complete the action. Your calendar was not changed.';
}
