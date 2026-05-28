import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import type { ChatMessage } from '@/src/entities/chat/types';
import {
  buildAgentSystemContextSegments,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import { warnIfFalseExecutionClaim } from '@/src/features/agent/capabilityHonesty';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import { tryBuildHumanizedCalendarReply } from '@/src/features/agent/calendar/calendarHumanizedReply';
import { useHydrateExecutiveConversation } from '@/src/features/chat/hooks/useHydrateExecutiveConversation';
import { prepareMemoryPromptContext } from '@/src/features/chat/memory';
import { sendExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  createConversationMessage,
  getConversationPayloadMessages,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';
import { processVoiceReminderTranscript } from '@/src/features/reminders/processVoiceReminder';
import { formatVoiceResponse } from '@/src/features/voice/speech/voiceSpeechFormatter';
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeech,
} from '@/src/features/chat/services/speechSynthesis';
import {
  buildVoiceSessionContext,
  buildVoiceSessionSystemPrompt,
} from '@/src/features/voice/memory';
import { buildVoiceSessionMemoryFromMessages } from '@/src/features/voice/memory/voiceSessionFromMessages';
import {
  tryBuildGymLunchPivotReply,
  tryBuildVoiceSessionFollowUpReply,
} from '@/src/features/voice/memory/voiceSessionFollowUp';
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

export function useHomeVoiceAssistant() {
  const queryClient = useQueryClient();
  useHydrateExecutiveConversation();

  const storeMessages = useExecutiveConversationStore((state) => state.messages);
  const conversationMessages = useMemo(
    () => storeMessages.filter((message) => message.role === 'user' || message.role === 'assistant'),
    [storeMessages],
  );
  const appendUserMessage = useExecutiveConversationStore((state) => state.appendUserMessage);
  const appendAssistantMessage = useExecutiveConversationStore((state) => state.appendAssistantMessage);
  const clearConversation = useExecutiveConversationStore((state) => state.clearConversation);
  const persistConversation = useExecutiveConversationStore((state) => state.persist);

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
  const [isSpeechMuted, setIsSpeechMuted] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
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

  const formatHomeVoiceReply = useCallback(
    (reply: string, urgency: 'immediate' | 'soon' | 'relaxed' | 'free' = 'relaxed') =>
      formatVoiceResponse(reply, {
        maxSentences: 2,
        urgency,
        locale: getChatLocaleFromVoiceLanguage(languageCodeRef.current),
      }),
    [],
  );

  const resolveVoiceSession = useCallback(
    (messages: ChatMessage[]) => buildVoiceSessionMemoryFromMessages(messages),
    [],
  );

  const playAssistantResponse = useCallback(
    (reply: string, assistantMessageId: string) => {
      const speechText = reply.trim();
      setHighlightedMessageId(assistantMessageId);

      if (isSpeechMutedRef.current || !isSpeechSynthesisSupported()) {
        setVoiceStatus('answered');
        setStatusText('Answer ready');
        return;
      }

      if (!speechText) {
        setVoiceStatus('answered');
        setStatusText('Answer ready');
        return;
      }

      setVoiceStatus('speaking');
      setStatusText('Speaking...');

      speakText(speechText, {
        languageCode: languageCodeRef.current,
        lang: recognitionLocaleRef.current,
        onStart: () => {
          setVoiceStatus('speaking');
          setStatusText('Speaking...');
        },
        onEnd: () => {
          setVoiceStatus('answered');
          setStatusText('Answer ready');
          setHighlightedMessageId(null);
        },
        onError: () => {
          setVoiceStatus('answered');
          setStatusText('Answer ready (speech unavailable)');
          setHighlightedMessageId(null);
        },
      });
    },
    [],
  );

  const finishAssistantTurn = useCallback(
    (assistantText: string) => {
      const message = appendAssistantMessage(assistantText);
      void persistConversation();

      const session = resolveVoiceSession(useExecutiveConversationStore.getState().messages);
      console.log('[Voice Session] state', {
        turns: session.messages.length,
        facts: session.state.facts,
        userLocation: session.state.userLocation,
        lastAdvice: session.state.lastAssistantRecommendation?.slice(0, 80),
      });

      return message;
    },
    [appendAssistantMessage, persistConversation, resolveVoiceSession],
  );

  const sendTranscriptToAssistant = useCallback(
    async (transcript: string) => {
      if (!transcript.trim() || isSendingRef.current) {
        return;
      }

      isSendingRef.current = true;
      stopSpeech();
      const trimmedTranscript = transcript.trim();
      setHeardTranscript('');
      setLiveTranscript('');
      console.log('[Voice Test] transcript', trimmedTranscript);
      console.log('[Voice] Sending to assistant');

      try {
        setVoiceStatus('processing');
        setStatusText('Thinking...');

        appendUserMessage(trimmedTranscript);
        void persistConversation();

        const payloadMessages = getConversationPayloadMessages(
          useExecutiveConversationStore.getState().messages,
        );
        const voiceSession = resolveVoiceSession(
          useExecutiveConversationStore.getState().messages,
        );
        const sessionContext = buildVoiceSessionContext(voiceSession);

        const reminderResult = await processVoiceReminderTranscript({
          transcript: trimmedTranscript,
          languageCode: languageCodeRef.current,
        });

        if (reminderResult) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.agent.homePreview(),
          });

          const spokenReminder = formatHomeVoiceReply(reminderResult.confirmation);
          warnIfFalseExecutionClaim(spokenReminder, 'executed');
          const assistantMessage = finishAssistantTurn(spokenReminder);
          playAssistantResponse(spokenReminder, assistantMessage.id);
          return;
        }

        const orchestrator = await createExecutiveAgentOrchestrator({
          locale: getChatLocaleFromVoiceLanguage(languageCodeRef.current),
          chatMessages: payloadMessages,
        });
        const referenceNow = new Date(orchestrator.context.now);
        const calendarEvents = getAssistantVisibleCalendarEvents(
          orchestrator.snapshot,
          referenceNow,
        );

        const gymLunchPivot = tryBuildGymLunchPivotReply({
          transcript: trimmedTranscript,
          session: sessionContext,
          languageCode: languageCodeRef.current,
        });

        if (gymLunchPivot) {
          const spokenPivot = formatHomeVoiceReply(gymLunchPivot, 'relaxed');
          const assistantMessage = finishAssistantTurn(spokenPivot);
          playAssistantResponse(spokenPivot, assistantMessage.id);
          return;
        }

        const humanizedReply = tryBuildHumanizedCalendarReply({
          transcript: trimmedTranscript,
          visibleEvents: calendarEvents,
          languageCode: languageCodeRef.current,
          referenceNow,
          sessionContext,
        });

        if (humanizedReply) {
          const assistantMessage = finishAssistantTurn(humanizedReply.responseText);
          playAssistantResponse(humanizedReply.responseText, assistantMessage.id);
          return;
        }

        const sessionFollowUp = tryBuildVoiceSessionFollowUpReply({
          transcript: trimmedTranscript,
          session: sessionContext,
          visibleEvents: calendarEvents,
          languageCode: languageCodeRef.current,
          referenceNow,
        });

        if (sessionFollowUp) {
          const spokenFollowUp = formatHomeVoiceReply(sessionFollowUp, 'soon');
          const assistantMessage = finishAssistantTurn(spokenFollowUp);
          playAssistantResponse(spokenFollowUp, assistantMessage.id);
          return;
        }

        const memoryContext = await prepareMemoryPromptContext(payloadMessages);
        const voiceSessionPrompt = buildVoiceSessionSystemPrompt(voiceSession);
        const systemMessages = [
          ...memoryContext.systemMessages,
          ...(voiceSessionPrompt
            ? [createConversationMessage('system', voiceSessionPrompt)]
            : []),
          ...buildAgentSystemContextSegments(
            orchestrator,
            languageCodeRef.current,
            trimmedTranscript,
          ).map((segment) =>
            createConversationMessage(
              'system',
              `${segment} Use it subtly and only when it genuinely sharpens the reply.`,
            ),
          ),
        ];
        const reply = await sendExecutiveChatMessage(payloadMessages, systemMessages);

        const spokenReply = formatHomeVoiceReply(reply);
        warnIfFalseExecutionClaim(spokenReply, 'drafted');
        const assistantMessage = finishAssistantTurn(spokenReply);
        playAssistantResponse(spokenReply, assistantMessage.id);
      } catch (error) {
        const apiError = toApiError(error);
        console.log('[Voice] Error', apiError.message);
        setVoiceStatus('error');
        setStatusText(apiError.message);
      } finally {
        isSendingRef.current = false;
      }
    },
    [
      appendUserMessage,
      finishAssistantTurn,
      formatHomeVoiceReply,
      persistConversation,
      playAssistantResponse,
      queryClient,
      resolveVoiceSession,
    ],
  );

  const handleClearConversation = useCallback(() => {
    stopAllVoiceOutput();
    setVoiceStatus('idle');
    setStatusText('Conversation cleared. Tap the microphone to speak.');
    setLiveTranscript('');
    setHeardTranscript('');
    setHighlightedMessageId(null);
    void clearConversation();
  }, [clearConversation, stopAllVoiceOutput]);

  const toggleSpeechMute = useCallback(() => {
    setIsSpeechMuted((currentValue) => {
      const nextValue = !currentValue;

      if (nextValue) {
        stopSpeech();
        if (voiceStatus === 'speaking') {
          setVoiceStatus('answered');
          setStatusText('Answer ready (muted)');
          setHighlightedMessageId(null);
        }
      }

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
      setHighlightedMessageId(null);
      return;
    }

    if (voiceStatus === 'processing') {
      return;
    }

    stopAllVoiceOutput();
    setHeardTranscript('');
    setLiveTranscript('');

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        releaseMicrophoneStream();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStreamRef.current = stream;
        setMicrophoneStream(stream);
      } catch (error) {
        const permissionDenied =
          error instanceof DOMException &&
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');

        if (permissionDenied) {
          setVoiceStatus('error');
          setStatusText(
            'Microphone access was denied. Allow microphone permission in your browser settings and try again.',
          );
          return;
        }
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

  const pendingUserTranscript = useMemo(() => {
    if (voiceStatus === 'listening') {
      return liveTranscript.trim() || undefined;
    }

    if (voiceStatus === 'processing' && heardTranscript.trim()) {
      return undefined;
    }

    return undefined;
  }, [heardTranscript, liveTranscript, voiceStatus]);

  const isVoiceBusy =
    voiceStatus === 'listening' || voiceStatus === 'processing' || voiceStatus === 'speaking';

  return {
    voiceStatus,
    statusText,
    conversationMessages,
    pendingUserTranscript,
    highlightedMessageId,
    isProcessing: voiceStatus === 'processing',
    isSpeechMuted,
    isSpeechSupported: isSpeechSynthesisSupported(),
    voiceLanguage: languageCode,
    voiceLanguageLabel: activeLanguageLabel,
    isVoiceLanguageHydrated,
    isVoiceLanguageDisabled: isVoiceBusy,
    canClearConversation: conversationMessages.length > 0,
    setVoiceLanguage,
    microphoneStream,
    handleMicrophonePress,
    handleClearConversation,
    toggleSpeechMute,
  };
}
