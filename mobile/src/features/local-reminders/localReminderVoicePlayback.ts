import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export type LocalReminderSpeakFn = (
  text: string,
  options: {
    languageCode?: VoiceLanguageCode;
    lang?: string;
    conversational?: boolean;
    onError?: (message: string) => void;
  },
) => void;

export function playLocalReminderVoice(params: {
  message: string;
  languageCode: VoiceLanguageCode;
  isSupported: () => boolean;
  speak: LocalReminderSpeakFn;
  onBlocked: (reason: string) => void;
  onPlay: () => void;
}) {
  const trimmedMessage = params.message.trim();

  if (!trimmedMessage) {
    params.onBlocked('empty_message');
    return;
  }

  if (!params.isSupported()) {
    params.onBlocked('speech_synthesis_unsupported');
    return;
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.resume();
  }

  params.onPlay();

  params.speak(trimmedMessage, {
    languageCode: params.languageCode,
    lang: params.languageCode,
    conversational: true,
    onError: (reason) => {
      params.onBlocked(reason);
    },
  });
}
