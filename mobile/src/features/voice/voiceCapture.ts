import { Platform } from 'react-native';

import { startSpeechRecognition } from '@/src/features/chat/services/speechRecognition';
import {
  cancelNativeAudioRecording,
  startNativeAudioRecording,
  stopNativeAudioRecording,
} from '@/src/features/voice/nativeRecording';
import { transcribeAudioFile } from '@/src/features/voice/transcribeAudio';

type VoiceCaptureCallbacks = {
  language: string;
  maxListeningMs?: number;
  speechEndDelayMs?: number;
  onStart?: () => void;
  onPartialTranscript?: (transcript: string) => void;
  onError: (message: string) => void;
  onEnd: (transcript: string) => void;
};

export type VoiceCaptureSession =
  | {
      status: 'active';
      stop: () => void;
    }
  | {
      status: 'unsupported';
      message: string;
    };

export function isNativeVoiceCaptureAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function startWebVoiceCapture({
  language,
  maxListeningMs = 15000,
  speechEndDelayMs = 1800,
  onStart,
  onPartialTranscript,
  onError,
  onEnd,
}: VoiceCaptureCallbacks): VoiceCaptureSession {
  let finalTranscript = '';

  const session = startSpeechRecognition({
    language,
    maxListeningMs,
    speechEndDelayMs,
    onStart,
    onResult: (transcript, isFinal) => {
      onPartialTranscript?.(transcript);

      if (isFinal) {
        finalTranscript = transcript;
      }
    },
    onInfo: (message) => {
      if (!finalTranscript.trim()) {
        onError(message);
      }
    },
    onError,
    onEnd: () => {
      onEnd(finalTranscript.trim());
    },
  });

  if (session.status === 'unsupported') {
    return session;
  }

  return {
    status: 'active',
    stop: () => {
      session.stop();
    },
  };
}

function startNativeVoiceCapture({
  language,
  onStart,
  onPartialTranscript,
  onError,
  onEnd,
}: VoiceCaptureCallbacks): VoiceCaptureSession {
  let disposed = false;
  let recordingPromise: Promise<import('expo-av').Audio.Recording> | null = null;

  recordingPromise = startNativeAudioRecording()
    .then((recording) => {
      if (disposed) {
        void cancelNativeAudioRecording();
        return recording;
      }

      onStart?.();
      onPartialTranscript?.('Recording...');
      return recording;
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : 'Unable to start microphone recording.';
      onError(message);
      throw error;
    });

  return {
    status: 'active',
    stop: () => {
      if (disposed) {
        return;
      }

      disposed = true;

      void (async () => {
        try {
          const recording = await recordingPromise;

          if (!recording) {
            onEnd('');
            return;
          }

          onPartialTranscript?.('Transcribing...');
          const uri = await stopNativeAudioRecording(recording);
          const transcript = await transcribeAudioFile({
            uri,
            language,
            mimeType: 'audio/m4a',
          });
          onEnd(transcript.trim());
        } catch (error) {
          await cancelNativeAudioRecording();
          const message =
            error instanceof Error ? error.message : 'Voice transcription failed.';
          onError(message);
          onEnd('');
        }
      })();
    },
  };
}

export function startVoiceCapture(callbacks: VoiceCaptureCallbacks): VoiceCaptureSession {
  if (isNativeVoiceCaptureAvailable()) {
    return startNativeVoiceCapture(callbacks);
  }

  return startWebVoiceCapture(callbacks);
}
