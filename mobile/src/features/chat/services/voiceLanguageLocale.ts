/** Locale helpers without React Native — safe for Node calendar tests. */

export type VoiceLanguageCode = 'en-US' | 'uk-UA' | 'ru-RU';

export type VoiceLanguageChatLocale = 'en' | 'uk' | 'ru';

const CHAT_LOCALE_BY_CODE: Record<VoiceLanguageCode, VoiceLanguageChatLocale> = {
  'en-US': 'en',
  'uk-UA': 'uk',
  'ru-RU': 'ru',
};

export function getChatLocaleFromVoiceLanguage(code: VoiceLanguageCode): VoiceLanguageChatLocale {
  return CHAT_LOCALE_BY_CODE[code] ?? 'en';
}
