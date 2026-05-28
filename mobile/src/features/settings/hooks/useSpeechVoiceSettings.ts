import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { speakText } from '@/src/features/chat/services/speechSynthesis';
import {
  formatSpeechVoiceLabel,
  getSpeechTestPhrase,
  listSpeechVoicesForLanguage,
  loadSpeechVoicePreferenceState,
  resolveSpeechVoice,
  setPreferredSpeechVoiceURI,
} from '@/src/features/chat/services/speechVoice';

export function useSpeechVoiceSettings() {
  const { languageCode, activeLanguageLabel } = useVoiceLanguage();
  const isSupported = Platform.OS === 'web';
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [resolvedVoiceName, setResolvedVoiceName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isSupported);

  const refresh = useCallback(async () => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [languageVoices, preference] = await Promise.all([
      listSpeechVoicesForLanguage(languageCode),
      loadSpeechVoicePreferenceState(),
    ]);
    const resolvedVoice = await resolveSpeechVoice({
      languageCode,
      preferredVoiceURI: preference.voiceURI,
    });

    setVoices(languageVoices);
    setSelectedVoiceURI(preference.voiceURI);
    setResolvedVoiceName(resolvedVoice?.name ?? null);
    setIsLoading(false);
  }, [isSupported, languageCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectVoice = useCallback(
    async (voiceURI: string | null) => {
      await setPreferredSpeechVoiceURI(voiceURI);
      setSelectedVoiceURI(voiceURI);
      const resolvedVoice = await resolveSpeechVoice({
        languageCode,
        preferredVoiceURI: voiceURI,
      });
      setResolvedVoiceName(resolvedVoice?.name ?? null);
    },
    [languageCode],
  );

  const testSelectedVoice = useCallback(() => {
    void resolveSpeechVoice({ languageCode, preferredVoiceURI: selectedVoiceURI }).then((voice) => {
      speakText(getSpeechTestPhrase(languageCode), {
        voice,
        languageCode,
        conversational: true,
      });
    });
  }, [languageCode, selectedVoiceURI]);

  return {
    isSupported,
    isLoading,
    voices,
    selectedVoiceURI,
    resolvedVoiceName,
    activeLanguageLabel,
    selectVoice,
    testSelectedVoice,
    refresh,
    formatSpeechVoiceLabel,
  };
}
