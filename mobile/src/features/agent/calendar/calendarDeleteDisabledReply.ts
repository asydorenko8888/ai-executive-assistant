import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export function buildCalendarDeleteDisabledReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Видалення поки не реалізовано повністю.';
  }

  if (locale === 'ru') {
    return 'Удаление пока не реализовано полностью.';
  }

  return 'Delete flow is not fully implemented yet.';
}

export const CALENDAR_DELETE_DISABLED_CODE = 'CALENDAR_DELETE_NOT_IMPLEMENTED';
