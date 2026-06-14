import { Platform } from 'react-native';

import { startSpeechRecognition } from '@/src/features/chat/services/speechRecognition';
import {
  cancelNativeAudioRecording,
  startNativeAudioRecording,
  stopNativeAudioRecording,
} from '@/src/features/voice/nativeRecording';
import { transcribeAudioFile } from '@/src/features/voice/transcribeAudio';
import {
  logAudioFileReady,
  logRecordingStarted,
  logRecordingStopped,
  logTranscribeError,
} from '@/src/features/voice/speechPipelineLog';
import {
  resolveSpeechTranscriptionUserMessage,
  SPEECH_TRANSCRIBE_TIMEOUT_MS,
} from '@/src/features/voice/speechTranscriptionUserMessage';
import { ApiError } from '@/src/shared/api';
import {
  logRecordingStoppedOk,
  logStartRecordingCalled,
  logStopRecordingCalled,
} from '@/src/features/voice/voiceMicDiagnostics';

const NATIVE_TRANSCRIPTION_PHASE_TIMEOUT_MS = SPEECH_TRANSCRIBE_TIMEOUT_MS + 3_000;

type VoiceCaptureCallbacks = {
  language: string;
  maxListeningMs?: number;
  maxRecordingMs?: number;
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

export function stopRecording(session: VoiceCaptureSession | null | undefined) {
  logStopRecordingCalled();

  if (session?.status !== 'active') {
    return false;
  }

  session.stop();
  return true;
}

export function isNativeVoiceCaptureAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export const DEFAULT_VOICE_CAPTURE_MAX_MS = 7000;
export const DEFAULT_VOICE_CAPTURE_SILENCE_MS = 1400;

function startWebVoiceCapture({
  language,
  maxListeningMs = DEFAULT_VOICE_CAPTURE_MAX_MS,
  speechEndDelayMs = DEFAULT_VOICE_CAPTURE_SILENCE_MS,
  onStart,
  onPartialTranscript,
  onError,
  onEnd,
}: VoiceCaptureCallbacks): VoiceCaptureSession {
  let finalTranscript = '';
  let started = false;

  const session = startSpeechRecognition({
    language,
    maxListeningMs,
    speechEndDelayMs,
    onStart: () => {
      logStartRecordingCalled();
      logRecordingStarted();
      started = true;
      onStart?.();
    },
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
      if (started) {
        logRecordingStopped({ reason: 'web_recognition_end' });
        logRecordingStoppedOk();
      }
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
  maxRecordingMs = DEFAULT_VOICE_CAPTURE_MAX_MS,
  onStart,
  onPartialTranscript,
  onError,
  onEnd,
}: VoiceCaptureCallbacks): VoiceCaptureSession {
  let disposed = false;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  let recordingPromise: Promise<import('expo-av').Audio.Recording> | null = null;

  const finishStop = (handler: () => void) => {
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }

    handler();
  };

  const stopRecordingInternal = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    let transcriptionSettled = false;

    const settleTranscription = (handler: () => void) => {
      if (transcriptionSettled) {
        return;
      }

      transcriptionSettled = true;
      finishStop(handler);
    };

    void (async () => {
      const phaseTimeout = setTimeout(() => {
        if (transcriptionSettled) {
          return;
        }

        const message = resolveSpeechTranscriptionUserMessage(
          new Error('Speech transcription phase timed out.'),
        );
        logTranscribeError({ message, code: 'SPEECH_TRANSCRIBE_PHASE_TIMEOUT' });
        settleTranscription(() => {
          onError(message);
          onEnd('');
        });
      }, NATIVE_TRANSCRIPTION_PHASE_TIMEOUT_MS);

      try {
        const recording = await recordingPromise;

        if (!recording) {
          logRecordingStopped({ reason: 'missing_recording' });
          settleTranscription(() => {
            logRecordingStoppedOk();
            onEnd('');
          });
          return;
        }

        onPartialTranscript?.('Transcribing...');
        logRecordingStopped({ reason: 'native_stop_requested' });
        const uri = await stopNativeAudioRecording(recording);
        logAudioFileReady({ uri });
        const transcript = await transcribeAudioFile({
          uri,
          language,
          mimeType: 'audio/m4a',
        });

        if (transcriptionSettled) {
          return;
        }

        clearTimeout(phaseTimeout);
        settleTranscription(() => {
          logRecordingStoppedOk();
          onEnd(transcript.trim());
        });
      } catch (error) {
        if (transcriptionSettled) {
          return;
        }

        clearTimeout(phaseTimeout);
        await cancelNativeAudioRecording();
        const message = resolveSpeechTranscriptionUserMessage(error);
        logTranscribeError({
          message,
          code: error instanceof ApiError ? error.code : undefined,
        });
        settleTranscription(() => {
          onError(message);
          onEnd('');
        });
      }
    })();
  };

  recordingPromise = startNativeAudioRecording({
    onSilenceStop: () => {
      if (!disposed) {
        stopRecordingInternal();
      }
    },
  })
    .then((recording) => {
      if (disposed) {
        void cancelNativeAudioRecording();
        return recording;
      }

      logStartRecordingCalled();
      logRecordingStarted();
      onStart?.();
      onPartialTranscript?.('Recording...');
      autoStopTimer = setTimeout(() => {
        if (!disposed) {
          stopRecordingInternal();
        }
      }, maxRecordingMs);
      return recording;
    })
    .catch((error) => {
      if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
      }

      const message =
        error instanceof Error ? error.message : 'Unable to start microphone recording.';
      onError(message);
      throw error;
    });

  return {
    status: 'active',
    stop: stopRecordingInternal,
  };
}

export function startVoiceCapture(callbacks: VoiceCaptureCallbacks): VoiceCaptureSession {
  if (isNativeVoiceCaptureAvailable()) {
    return startNativeVoiceCapture(callbacks);
  }

  return startWebVoiceCapture(callbacks);
}
