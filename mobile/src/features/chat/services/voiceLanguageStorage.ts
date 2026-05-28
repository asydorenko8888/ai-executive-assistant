import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const VOICE_LANGUAGE_PREFERENCE_KEY = 'voice-language-preference';

export type VoiceLanguagePreference = {
  languageCode: VoiceLanguageCode;
};

export async function loadVoiceLanguagePreference(): Promise<VoiceLanguageCode | null> {
  const stored = await getStoredJson<VoiceLanguagePreference | null>(VOICE_LANGUAGE_PREFERENCE_KEY, null);

  return stored?.languageCode ?? null;
}

export async function saveVoiceLanguagePreference(languageCode: VoiceLanguageCode) {
  return setStoredJson<VoiceLanguagePreference>(VOICE_LANGUAGE_PREFERENCE_KEY, { languageCode });
}
