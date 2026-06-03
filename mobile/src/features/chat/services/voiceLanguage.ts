import { Platform } from 'react-native';

import {
  loadVoiceLanguagePreference,
  saveVoiceLanguagePreference,
} from '@/src/features/chat/services/voiceLanguageStorage';

import {
  getChatLocaleFromVoiceLanguage as getChatLocaleFromVoiceLanguageCode,
  type VoiceLanguageChatLocale,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

/** BCP-47 locale codes used for speech recognition and TTS. */
export type { VoiceLanguageCode, VoiceLanguageChatLocale };

export type VoiceLanguageDefinition = {
  code: VoiceLanguageCode;
  label: string;
  shortLabel: string;
  recognitionLocale: VoiceLanguageCode;
  chatLocale: VoiceLanguageChatLocale;
};

/** Registry for supported voice languages — extend this list to add more locales. */
export const VOICE_LANGUAGE_REGISTRY: readonly VoiceLanguageDefinition[] = [
  {
    code: 'en-US',
    label: 'English (US)',
    shortLabel: 'EN',
    recognitionLocale: 'en-US',
    chatLocale: 'en',
  },
  {
    code: 'uk-UA',
    label: 'Ukrainian',
    shortLabel: 'UA',
    recognitionLocale: 'uk-UA',
    chatLocale: 'uk',
  },
  {
    code: 'ru-RU',
    label: 'Russian',
    shortLabel: 'RU',
    recognitionLocale: 'ru-RU',
    chatLocale: 'ru',
  },
] as const;

const voiceLanguageByCode = Object.fromEntries(
  VOICE_LANGUAGE_REGISTRY.map((language) => [language.code, language]),
) as Record<VoiceLanguageCode, VoiceLanguageDefinition>;

export function isVoiceLanguageCode(value: string): value is VoiceLanguageCode {
  return value in voiceLanguageByCode;
}

export function getVoiceLanguageDefinition(code: VoiceLanguageCode) {
  return voiceLanguageByCode[code];
}

export function getRecognitionLocale(code: VoiceLanguageCode) {
  return getVoiceLanguageDefinition(code).recognitionLocale;
}

export function getChatLocaleFromVoiceLanguage(code: VoiceLanguageCode): VoiceLanguageChatLocale {
  return getChatLocaleFromVoiceLanguageCode(code);
}

/** @deprecated Use VoiceLanguageCode — kept for compact UI toggles. */
export type VoiceRecognitionLanguageOption = 'EN' | 'UA' | 'RU';

export function voiceLanguageCodeFromShortLabel(
  shortLabel: VoiceRecognitionLanguageOption,
): VoiceLanguageCode {
  const match = VOICE_LANGUAGE_REGISTRY.find((language) => language.shortLabel === shortLabel);

  return match?.code ?? 'en-US';
}

export function shortLabelFromVoiceLanguageCode(code: VoiceLanguageCode): VoiceRecognitionLanguageOption {
  return getVoiceLanguageDefinition(code).shortLabel as VoiceRecognitionLanguageOption;
}

/** @deprecated Use getRecognitionLocale — kept for existing imports. */
export const voiceRecognitionLanguageMap: Record<VoiceRecognitionLanguageOption, VoiceLanguageCode> = {
  EN: 'en-US',
  UA: 'uk-UA',
  RU: 'ru-RU',
};

export function getDefaultVoiceLanguageCode(): VoiceLanguageCode {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const browserLocale = (navigator.language || '').toLowerCase();

    if (browserLocale.startsWith('uk')) {
      return 'uk-UA';
    }
  }

  return 'en-US';
}

export function logVoiceLanguageDiagnostics(languageCode: VoiceLanguageCode) {
  const definition = getVoiceLanguageDefinition(languageCode);

  console.log('[Voice] Selected language:', definition.label, `(${languageCode})`);
  console.log('[Voice] Recognition language:', definition.recognitionLocale);
}

export async function loadPersistedVoiceLanguageCode(): Promise<VoiceLanguageCode> {
  const saved = await loadVoiceLanguagePreference();

  if (saved && isVoiceLanguageCode(saved)) {
    return saved;
  }

  return getDefaultVoiceLanguageCode();
}

export async function persistVoiceLanguageCode(languageCode: VoiceLanguageCode) {
  await saveVoiceLanguagePreference(languageCode);
  logVoiceLanguageDiagnostics(languageCode);
}
