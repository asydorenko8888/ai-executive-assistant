import { Platform } from 'react-native';

import { getDefaultVoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type { VoiceRecognitionLanguageOption } from '@/src/features/chat/services/voiceLanguage';
export {
  getDefaultVoiceLanguageCode as getDefaultVoiceRecognitionLanguage,
  voiceRecognitionLanguageMap,
} from '@/src/features/chat/services/voiceLanguage';

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'unknown';

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: SpeechRecognitionErrorCode | string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: null | (() => void);
  onresult: null | ((event: SpeechRecognitionEventLike) => void);
  onerror: null | ((event: SpeechRecognitionErrorEventLike) => void);
  onend: null | (() => void);
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type VoiceRecognitionCallbacks = {
  language?: string;
  maxListeningMs?: number;
  speechEndDelayMs?: number;
  onStart?: () => void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onInfo?: (message: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

type UnsupportedVoiceRecognition = {
  status: 'unsupported';
  message: string;
};

type ActiveVoiceRecognition = {
  status: 'active';
  stop: () => void;
};

export type VoiceRecognitionSession = UnsupportedVoiceRecognition | ActiveVoiceRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function mapRecognitionErrorToMessage(errorCode?: string) {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow microphone permission in your browser settings and try again.';
    case 'audio-capture':
      return 'No working microphone was detected. Check your microphone device and try again.';
    case 'no-speech':
      return 'No speech was detected. Try speaking more clearly and a little closer to the microphone.';
    case 'network':
      return 'Speech recognition encountered a network issue. Please try again.';
    case 'aborted':
      return 'Voice capture was stopped before completion.';
    default:
      return 'Voice input is currently unavailable on this device or browser. Please type your message manually.';
  }
}

export function startSpeechRecognition({
  language = getDefaultVoiceLanguageCode(),
  maxListeningMs = 15000,
  speechEndDelayMs = 1800,
  onStart,
  onResult,
  onInfo,
  onError,
  onEnd,
}: VoiceRecognitionCallbacks): VoiceRecognitionSession {
  const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

  if (!SpeechRecognitionConstructor) {
    return {
      status: 'unsupported',
      message:
        'Voice input is currently available only in supported web browsers. On this device, please type your message manually.',
    };
  }

  const recognition = new SpeechRecognitionConstructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;

  console.log('[Voice] Recognition language:', recognition.lang);

  let manualStop = false;
  let detectedSpeech = false;
  let maxListeningTimeout: ReturnType<typeof setTimeout> | null = null;
  let speechEndTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (maxListeningTimeout) {
      clearTimeout(maxListeningTimeout);
      maxListeningTimeout = null;
    }

    if (speechEndTimeout) {
      clearTimeout(speechEndTimeout);
      speechEndTimeout = null;
    }
  };

  const stopRecognition = () => {
    manualStop = true;
    clearTimers();
    recognition.stop();
  };

  const scheduleAutoStop = () => {
    if (speechEndTimeout) {
      clearTimeout(speechEndTimeout);
    }

    speechEndTimeout = setTimeout(() => {
      stopRecognition();
    }, speechEndDelayMs);
  };

  recognition.onstart = () => {
    onStart?.();

    maxListeningTimeout = setTimeout(() => {
      if (!detectedSpeech) {
        onInfo?.('No speech detected. Try again when you are ready.');
      }

      stopRecognition();
    }, maxListeningMs);
  };

  recognition.onresult = (event) => {
    let transcript = '';
    let hasFinalResult = false;

    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      transcript += result[0]?.transcript ?? '';
      hasFinalResult = hasFinalResult || result.isFinal;
    }

    const normalizedTranscript = transcript.trim();

    if (!normalizedTranscript) {
      return;
    }

    detectedSpeech = true;
    onResult(normalizedTranscript, hasFinalResult);

    if (hasFinalResult) {
      scheduleAutoStop();
      return;
    }

    if (speechEndTimeout) {
      clearTimeout(speechEndTimeout);
      speechEndTimeout = null;
    }
  };

  recognition.onerror = (event) => {
    if (manualStop && (event.error === 'aborted' || event.error === undefined)) {
      return;
    }

    if (event.error === 'no-speech') {
      onInfo?.('No speech detected. Try again when you are ready.');
      return;
    }

    onError(mapRecognitionErrorToMessage(event.error));
  };

  recognition.onend = () => {
    clearTimers();
    onEnd();
  };

  try {
    recognition.start();
  } catch (error) {
    onError(
      error instanceof Error
        ? error.message
        : 'Voice input could not be started. Please try again.',
    );

    return {
      status: 'unsupported',
      message:
        'Voice input could not be started. Please check browser support or use manual text input.',
    };
  }

  return {
    status: 'active',
    stop: stopRecognition,
  };
}
