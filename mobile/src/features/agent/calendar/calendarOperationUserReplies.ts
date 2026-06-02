import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

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
