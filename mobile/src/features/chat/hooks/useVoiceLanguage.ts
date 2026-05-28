import { useCallback, useEffect, useState } from 'react';

import { invalidateSpeechVoiceCache } from '@/src/features/chat/services/speechVoice';
import {
  getDefaultVoiceLanguageCode,
  getRecognitionLocale,
  getVoiceLanguageDefinition,
  loadPersistedVoiceLanguageCode,
  logVoiceLanguageDiagnostics,
  persistVoiceLanguageCode,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguage';

export function useVoiceLanguage() {
  const [languageCode, setLanguageCode] = useState<VoiceLanguageCode>(getDefaultVoiceLanguageCode);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadPersistedVoiceLanguageCode().then((savedCode) => {
      if (cancelled) {
        return;
      }

      setLanguageCode(savedCode);
      logVoiceLanguageDiagnostics(savedCode);
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setVoiceLanguage = useCallback(async (nextCode: VoiceLanguageCode) => {
    setLanguageCode(nextCode);
    invalidateSpeechVoiceCache();
    await persistVoiceLanguageCode(nextCode);
  }, []);

  const activeLanguage = getVoiceLanguageDefinition(languageCode);

  return {
    languageCode,
    recognitionLocale: getRecognitionLocale(languageCode),
    activeLanguageLabel: activeLanguage.label,
    activeLanguageShortLabel: activeLanguage.shortLabel,
    isHydrated,
    setVoiceLanguage,
  };
}
