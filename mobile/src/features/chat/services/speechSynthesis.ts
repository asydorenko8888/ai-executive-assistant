import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  resolveSpeechVoice,
  SPEECH_PITCH,
  SPEECH_RATE,
  SPEECH_SENTENCE_PAUSE_MS,
} from '@/src/features/chat/services/speechVoice';
import { splitTextForSpeech } from '@/src/features/chat/services/speechText';

type SpeakTextOptions = {
  lang?: string;
  languageCode?: VoiceLanguageCode;
  conversational?: boolean;
  voice?: SpeechSynthesisVoice | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeSpeechSessionId = 0;

function getSpeechSynthesis() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return window.speechSynthesis ?? null;
}

function resolveNativeSpeechLanguage(options: SpeakTextOptions) {
  if (options.lang) {
    return options.lang;
  }

  if (options.languageCode) {
    return options.languageCode;
  }

  return 'en-US';
}

export function isSpeechSynthesisSupported() {
  if (Platform.OS === 'web') {
    return Boolean(getSpeechSynthesis() && typeof SpeechSynthesisUtterance !== 'undefined');
  }

  return true;
}

export function stopSpeech() {
  activeSpeechSessionId += 1;

  if (Platform.OS !== 'web') {
    Speech.stop();
    return;
  }

  const synthesis = getSpeechSynthesis();

  if (!synthesis) {
    return;
  }

  synthesis.cancel();
  activeUtterance = null;
}

function applyVoiceToUtterance(utterance: SpeechSynthesisUtterance, voice: SpeechSynthesisVoice | null | undefined) {
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
}

function speakSentence(
  text: string,
  options: SpeakTextOptions,
  sessionId: number,
): Promise<void> {
  const synthesis = getSpeechSynthesis();

  return new Promise((resolve, reject) => {
    if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Text-to-speech is not available in this browser.'));
      return;
    }

    if (sessionId !== activeSpeechSessionId) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || options.voice?.lang || navigator.language || 'en-US';
    utterance.rate = SPEECH_RATE;
    utterance.pitch = SPEECH_PITCH;
    applyVoiceToUtterance(utterance, options.voice);

    utterance.onstart = () => {
      if (sessionId !== activeSpeechSessionId) {
        return;
      }

      activeUtterance = utterance;
      options.onStart?.();
    };

    utterance.onend = () => {
      if (sessionId !== activeSpeechSessionId || activeUtterance !== utterance) {
        resolve();
        return;
      }

      activeUtterance = null;
      resolve();
    };

    utterance.onerror = (event) => {
      if (sessionId !== activeSpeechSessionId) {
        resolve();
        return;
      }

      activeUtterance = null;
      reject(new Error(event.error || 'Speech playback failed.'));
    };

    synthesis.speak(utterance);
  });
}

async function speakConversationally(text: string, options: SpeakTextOptions) {
  const sessionId = activeSpeechSessionId;
  const sentences = splitTextForSpeech(text);
  let started = false;

  for (const sentence of sentences) {
    if (sessionId !== activeSpeechSessionId) {
      return;
    }

    await speakSentence(
      sentence,
      {
        ...options,
        onStart: () => {
          if (!started) {
            started = true;
            options.onStart?.();
          }
        },
      },
      sessionId,
    );

    if (sessionId !== activeSpeechSessionId) {
      return;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, SPEECH_SENTENCE_PAUSE_MS);
    });
  }

  if (sessionId === activeSpeechSessionId) {
    options.onEnd?.();
  }
}

function speakNativeText(text: string, options: SpeakTextOptions = {}) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    options.onError?.('Nothing to speak.');
    return;
  }

  stopSpeech();
  const sessionId = activeSpeechSessionId;
  let started = false;

  Speech.speak(trimmedText, {
    language: resolveNativeSpeechLanguage(options),
    rate: SPEECH_RATE,
    pitch: SPEECH_PITCH,
    onStart: () => {
      if (sessionId !== activeSpeechSessionId || started) {
        return;
      }

      started = true;
      options.onStart?.();
    },
    onDone: () => {
      if (sessionId !== activeSpeechSessionId) {
        return;
      }

      options.onEnd?.();
    },
    onError: () => {
      if (sessionId !== activeSpeechSessionId) {
        return;
      }

      options.onError?.('Speech playback failed.');
    },
  });
}

export function speakText(text: string, options: SpeakTextOptions = {}) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    options.onError?.('Nothing to speak.');
    return;
  }

  if (Platform.OS !== 'web') {
    speakNativeText(trimmedText, options);
    return;
  }

  const synthesis = getSpeechSynthesis();

  if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    options.onError?.('Text-to-speech is not available in this browser.');
    return;
  }

  stopSpeech();
  const sessionId = activeSpeechSessionId;

  void (async () => {
    try {
      const voice =
        options.voice === undefined
          ? await resolveSpeechVoice({ languageCode: options.languageCode })
          : options.voice;
      const speechOptions = {
        ...options,
        voice,
        lang: options.lang ?? voice?.lang ?? options.languageCode,
      };

      if (options.conversational !== false) {
        await speakConversationally(trimmedText, speechOptions);
        return;
      }

      await speakSentence(trimmedText, speechOptions, sessionId);

      if (sessionId !== activeSpeechSessionId) {
        return;
      }

      options.onEnd?.();
    } catch (error) {
      if (sessionId !== activeSpeechSessionId) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Speech playback failed.';
      options.onError?.(message);
    }
  })();
}
