import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import type { ChatMessage } from '@/src/entities/chat/types';
import {
  buildAgentRuntimeContext,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { sendExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeech,
} from '@/src/features/chat/services/speechSynthesis';
import { processVoiceReminderTranscript } from '@/src/features/reminders/processVoiceReminder';
import { startVoiceCapture, type VoiceCaptureSession } from '@/src/features/voice/voiceCapture';
import { queryKeys, toApiError } from '@/src/shared/api';

export type HomeVoiceStatus =
  | 'idle'
  | 'listening'
  | 'heard'
  | 'processing'
  | 'speaking'
  | 'answered'
  | 'error';

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  const createdAt = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    id: `${role}-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt,
    status: role === 'assistant' ? 'read' : 'sent',
  };
}

export function useHomeVoiceAssistant() {
  const queryClient = useQueryClient();
  const {
    languageCode,
    recognitionLocale,
    activeLanguageLabel,
    setVoiceLanguage,
    isHydrated: isVoiceLanguageHydrated,
  } = useVoiceLanguage();
  const [voiceStatus, setVoiceStatus] = useState<HomeVoiceStatus>('idle');
  const [statusText, setStatusText] = useState('Tap the microphone to speak.');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [heardTranscript, setHeardTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [isSpeechMuted, setIsSpeechMuted] = useState(false);
  const voiceCaptureSessionRef = useRef<VoiceCaptureSession | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const isSendingRef = useRef(false);
  const isSpeechMutedRef = useRef(isSpeechMuted);
  const languageCodeRef = useRef(languageCode);
  const recognitionLocaleRef = useRef(recognitionLocale);

  useEffect(() => {
    isSpeechMutedRef.current = isSpeechMuted;
  }, [isSpeechMuted]);

  useEffect(() => {
    languageCodeRef.current = languageCode;
    recognitionLocaleRef.current = recognitionLocale;
  }, [languageCode, recognitionLocale]);

  const stopVoiceCapture = useCallback(() => {
    if (voiceCaptureSessionRef.current?.status === 'active') {
      voiceCaptureSessionRef.current.stop();
    }
  }, []);

  const releaseMicrophoneStream = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    setMicrophoneStream(null);
  }, []);

  const stopAllVoiceOutput = useCallback(() => {
    stopSpeech();
    stopVoiceCapture();
    releaseMicrophoneStream();
  }, [releaseMicrophoneStream, stopVoiceCapture]);

  useEffect(() => {
    return () => {
      stopAllVoiceOutput();
    };
  }, [stopAllVoiceOutput]);

  const playAssistantResponse = useCallback((reply: string) => {
    if (isSpeechMutedRef.current || !isSpeechSynthesisSupported()) {
      setVoiceStatus('answered');
      setStatusText('Answer ready');
      return;
    }

    setVoiceStatus('speaking');
    setStatusText('Speaking...');

    speakText(reply, {
      languageCode: languageCodeRef.current,
      lang: recognitionLocaleRef.current,
      onStart: () => {
        setVoiceStatus('speaking');
        setStatusText('Speaking...');
      },
      onEnd: () => {
        setVoiceStatus('answered');
        setStatusText('Answer ready');
      },
      onError: () => {
        setVoiceStatus('answered');
        setStatusText('Answer ready (speech unavailable)');
      },
    });
  }, []);

  const sendTranscriptToAssistant = useCallback(
    async (transcript: string) => {
      if (!transcript.trim() || isSendingRef.current) {
        return;
      }

      isSendingRef.current = true;
      stopSpeech();
      console.log('[Voice] Sending to assistant');

      try {
        setVoiceStatus('processing');
        setStatusText('Thinking...');

        const reminderResult = await processVoiceReminderTranscript({
          transcript: transcript.trim(),
          languageCode: languageCodeRef.current,
        });

        if (reminderResult) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.agent.homePreview(),
          });

          console.log('[Voice] Assistant response', reminderResult.confirmation);
          setAssistantResponse(reminderResult.confirmation);
          playAssistantResponse(reminderResult.confirmation);
          return;
        }

        const userMessage = createChatMessage('user', transcript.trim());
        const orchestrator = await createExecutiveAgentOrchestrator({
          locale: getChatLocaleFromVoiceLanguage(languageCodeRef.current),
          chatMessages: [userMessage],
        });
        const runtimeContext = buildAgentRuntimeContext(orchestrator);
        const systemMessages = runtimeContext
          ? [
              createChatMessage(
                'system',
                `Executive runtime context: ${runtimeContext} Use it subtly and only when it genuinely sharpens the reply.`,
              ),
            ]
          : [];
        const reply = await sendExecutiveChatMessage([userMessage], systemMessages);

        console.log('[Voice] Assistant response', reply);
        setAssistantResponse(reply);
        playAssistantResponse(reply);
      } catch (error) {
        const apiError = toApiError(error);
        console.log('[Voice] Error', apiError.message);
        setVoiceStatus('error');
        setStatusText(apiError.message);
      } finally {
        isSendingRef.current = false;
      }
    },
    [playAssistantResponse, queryClient],
  );

  const toggleSpeechMute = useCallback(() => {
    setIsSpeechMuted((currentValue) => {
      const nextValue = !currentValue;

      if (nextValue) {
        stopSpeech();
        if (voiceStatus === 'speaking') {
          setVoiceStatus('answered');
          setStatusText('Answer ready (muted)');
        }
      }

      console.log('[Voice] Speech mute', nextValue);
      return nextValue;
    });
  }, [voiceStatus]);

  const handleMicrophonePress = useCallback(async () => {
    if (voiceStatus === 'listening') {
      stopVoiceCapture();
      return;
    }

    if (voiceStatus === 'speaking') {
      stopSpeech();
      setVoiceStatus('answered');
      setStatusText('Ready');
      return;
    }

    if (voiceStatus === 'processing') {
      return;
    }

    stopAllVoiceOutput();
    setAssistantResponse('');
    setHeardTranscript('');
    setLiveTranscript('');

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        releaseMicrophoneStream();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStreamRef.current = stream;
        setMicrophoneStream(stream);
      } catch {
        // Orb visualization is optional on web.
      }
    }

    const captureSession = startVoiceCapture({
      language: recognitionLocaleRef.current,
      onStart: () => {
        setLiveTranscript('');
        setHeardTranscript('');
        setVoiceStatus('listening');
        setStatusText(
          Platform.OS === 'web' ? 'Listening...' : 'Recording... tap again when finished.',
        );
      },
      onPartialTranscript: (transcript) => {
        setLiveTranscript(transcript);
      },
      onError: (message) => {
        releaseMicrophoneStream();
        voiceCaptureSessionRef.current = null;
        setVoiceStatus('error');
        setStatusText(message);
      },
      onEnd: (transcript) => {
        releaseMicrophoneStream();
        voiceCaptureSessionRef.current = null;

        if (!transcript) {
          setVoiceStatus('idle');
          setStatusText('Tap the microphone to speak.');
          return;
        }

        setHeardTranscript(transcript);
        setLiveTranscript(transcript);
        setVoiceStatus('processing');
        setStatusText('Thinking...');
        void sendTranscriptToAssistant(transcript);
      },
    });

    voiceCaptureSessionRef.current = captureSession;

    if (captureSession.status === 'unsupported') {
      setVoiceStatus('error');
      setStatusText(captureSession.message);
    }
  }, [releaseMicrophoneStream, sendTranscriptToAssistant, stopAllVoiceOutput, stopVoiceCapture, voiceStatus]);

  const displayTranscript = heardTranscript || liveTranscript;
  const isVoiceBusy =
    voiceStatus === 'listening' || voiceStatus === 'processing' || voiceStatus === 'speaking';

  return {
    voiceStatus,
    statusText,
    displayTranscript,
    assistantResponse,
    isSpeechMuted,
    isSpeechSupported: isSpeechSynthesisSupported(),
    voiceLanguage: languageCode,
    voiceLanguageLabel: activeLanguageLabel,
    isVoiceLanguageHydrated,
    isVoiceLanguageDisabled: isVoiceBusy,
    setVoiceLanguage,
    microphoneStream,
    handleMicrophonePress,
    toggleSpeechMute,
  };
}
