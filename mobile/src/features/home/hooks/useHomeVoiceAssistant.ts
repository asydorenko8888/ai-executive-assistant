import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { refreshHomeBriefing } from '@/src/features/home/services/refreshHomeBriefing';

import type { ChatMessage } from '@/src/entities/chat/types';
import {
  buildAgentSystemContextSegments,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import { isCalendarAgendaQuery } from '@/src/features/agent/calendar/calendarAgendaSync';
import { warnIfFalseExecutionClaim, enforceCalendarReplyIfNeeded } from '@/src/features/agent/capabilityHonesty';
import {
  logAssistantReplyGenerated,
  logGeneralAssistantEntered,
} from '@/src/features/agent/conversation/assistantRoutingMarkers';
import {
  finalizeTurnReply,
  resolveAssistantTurn,
  shouldFormatReplyForVoice,
} from '@/src/features/agent/conversation/assistantTurnPipeline';
import { resolveVoiceTurnGate } from '@/src/features/agent/conversation/assistantVoiceTurnGate';
import { useHydrateExecutiveConversation } from '@/src/features/chat/hooks/useHydrateExecutiveConversation';
import { prepareMemoryPromptContext } from '@/src/features/chat/memory';
import { buildShortTermMemory } from '@/src/features/chat/memory/shortTermMemory';
import {
  buildAssistantRecoveryMessage,
  createAssistantRequestAbortController,
  isAbortError,
  logAssistantConversation,
} from '@/src/features/chat/services/assistantConversationLifecycle';
import { sendExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  createConversationMessage,
  getConversationPayloadMessages,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  blockLlmForCalendarMutation,
  requiresCalendarToolExecution,
} from '@/src/features/agent/calendar/calendarToolExecutionGate';
import { buildCalendarMoveExceptionReply } from '@/src/features/agent/calendar/calendarMoveExceptionReply';
import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  classifyCalendarAgendaQueryIntent,
  formatAgendaListForDisplay,
  formatVoiceResponse,
  shouldPreserveFullCalendarAgenda,
} from '@/src/features/voice/speech/voiceSpeechFormatter';
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeech,
} from '@/src/features/chat/services/speechSynthesis';
import { buildVoiceSessionSystemPrompt } from '@/src/features/voice/memory';
import { buildVoiceSessionMemoryFromMessages } from '@/src/features/voice/memory/voiceSessionFromMessages';
import {
  startVoiceCapture,
  stopRecording,
  DEFAULT_VOICE_CAPTURE_MAX_MS,
  type VoiceCaptureSession,
} from '@/src/features/voice/voiceCapture';
import { logAssistantRequestStart } from '@/src/features/voice/speechPipelineLog';
import {
  logMicButtonPressed,
  logMicStateBefore,
} from '@/src/features/voice/voiceMicDiagnostics';
import { toApiError } from '@/src/shared/api';

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
  const voiceStatusRef = useRef<HomeVoiceStatus>('idle');
  const isRecordingRef = useRef(false);
  const recordingEmergencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    voiceStatusRef.current = voiceStatus;
  }, [voiceStatus]);

  const clearRecordingEmergencyTimeout = useCallback(() => {
    if (recordingEmergencyTimeoutRef.current) {
      clearTimeout(recordingEmergencyTimeoutRef.current);
      recordingEmergencyTimeoutRef.current = null;
    }
  }, []);

  const releaseMicrophoneStream = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    setMicrophoneStream(null);
  }, []);

  const resetVoiceUiToReady = useCallback(
    (statusTextOverride = 'Tap the microphone to speak.') => {
      isRecordingRef.current = false;
      voiceCaptureSessionRef.current = null;
      clearRecordingEmergencyTimeout();
      releaseMicrophoneStream();
      setLiveTranscript('');
      setHeardTranscript('');
      setVoiceStatus('idle');
      setStatusText(statusTextOverride);
    },
    [clearRecordingEmergencyTimeout, releaseMicrophoneStream],
  );

  const stopActiveRecording = useCallback(() => {
    const session = voiceCaptureSessionRef.current;
    const stopped = stopRecording(session);

    if (!stopped) {
      resetVoiceUiToReady();
    }

    return stopped;
  }, [resetVoiceUiToReady]);

  const stopVoiceCapture = useCallback(() => {
    stopActiveRecording();
  }, [stopActiveRecording]);

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
    (
      reply: string,
      userTranscript = '',
      urgency: 'immediate' | 'soon' | 'relaxed' | 'free' = 'relaxed',
    ) => {
      const agendaOptions = {
        userTranscript,
        queryIntent: classifyCalendarAgendaQueryIntent(userTranscript),
        preserveFullCalendarList: true,
        disableVoiceShortening: true,
      };

      if (
        isCalendarAgendaQuery(userTranscript) ||
        shouldPreserveFullCalendarAgenda(reply, agendaOptions)
      ) {
        return formatAgendaListForDisplay(reply, agendaOptions);
      }

      return formatVoiceResponse(reply, {
        maxSentences: 2,
        urgency,
        locale: getChatLocaleFromVoiceLanguage(languageCodeRef.current),
        userTranscript,
        queryIntent: agendaOptions.queryIntent,
      });
    },
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

        const orchestrator = await createExecutiveAgentOrchestrator({
          locale: getChatLocaleFromVoiceLanguage(languageCodeRef.current),
          chatMessages: payloadMessages,
        });
        const referenceNow = new Date(orchestrator.context.now);
        const turn = await resolveAssistantTurn({
          messages: payloadMessages,
          orchestrator,
          languageCode: languageCodeRef.current,
          referenceNow,
          enableVoiceShortcuts: true,
        });

        const voiceGate = resolveVoiceTurnGate({
          turn,
          transcript: trimmedTranscript,
        });

        if (voiceGate.kind === 'local') {
          logAssistantReplyGenerated({
            source: voiceGate.source,
            transcriptPreview: trimmedTranscript,
            replyPreview: voiceGate.reply,
            route: turn.route,
          });

          warnIfFalseExecutionClaim(voiceGate.reply, turn.calendarVerified ? 'executed' : 'drafted');

          if (turn.calendarVerified) {
            void refreshHomeBriefing(queryClient);
          }

          const assistantMessage = finishAssistantTurn(voiceGate.reply);
          playAssistantResponse(voiceGate.reply, assistantMessage.id);
          return;
        }

        logGeneralAssistantEntered({
          transcriptPreview: trimmedTranscript,
          route: turn.route,
          behaviorMode: turn.behaviorMode,
        });

        const voiceSession = resolveVoiceSession(
          useExecutiveConversationStore.getState().messages,
        );
        const requestAbort = createAssistantRequestAbortController();

        try {
          requestAbort.touch();
          const memoryContext = isCalendarAgendaQuery(trimmedTranscript)
            ? {
                systemMessages: [],
                shortTermMemory: buildShortTermMemory(payloadMessages),
                relevantLongTermMemories: [],
              }
            : await prepareMemoryPromptContext(payloadMessages);
          requestAbort.touch();
          const voiceSessionPrompt = buildVoiceSessionSystemPrompt(voiceSession, {
            suppressEmotionalContinuation: turn.intent.shouldBypassEmotionalRouting,
            suppressCalendarAgendaMemory: isCalendarAgendaQuery(trimmedTranscript),
          });
          const systemMessages = [
            ...memoryContext.systemMessages,
            ...(voiceSessionPrompt
              ? [createConversationMessage('system', voiceSessionPrompt)]
              : []),
            ...(await buildAgentSystemContextSegments(
              orchestrator,
              languageCodeRef.current,
              trimmedTranscript,
            )).map((segment) =>
              createConversationMessage(
                'system',
                `${segment} Use it subtly and only when it genuinely sharpens the reply.`,
              ),
            ),
            ...(turn.intentPrompt ? [createConversationMessage('system', turn.intentPrompt)] : []),
          ];
          requestAbort.touch();

          if (requiresCalendarToolExecution(trimmedTranscript)) {
            const forced =
              blockLlmForCalendarMutation({
                transcript: trimmedTranscript,
                reason: 'voice pre-LLM guard',
              }) ??
              buildFailureTerminalReply(
                'CALENDAR_EXECUTION_CONTRACT',
                'calendar command blocked LLM',
              );
            const assistantMessage = finishAssistantTurn(forced);
            playAssistantResponse(forced, assistantMessage.id);
            return;
          }

          logAssistantConversation('[Conversation]', 'Voice LLM request started');
          const referenceNow = new Date(orchestrator.context.now);
          const visibleCalendarEvents = getAssistantVisibleCalendarEvents(
            orchestrator.snapshot,
            referenceNow,
          );
          const reply = await sendExecutiveChatMessage(payloadMessages, systemMessages, {
            signal: requestAbort.signal,
            llmDebug: {
              calendarEvents: visibleCalendarEvents.map((event) => ({
                title: event.title,
                startsAt: event.startsAt,
              })),
            },
          });
          requestAbort.touch();

          let candidateReply = reply;

          const finalized = finalizeTurnReply({
            messages: getConversationPayloadMessages(
              useExecutiveConversationStore.getState().messages,
            ),
            orchestrator,
            languageCode: languageCodeRef.current,
            referenceNow,
            candidateReply,
          });
          const spokenReply =
            (shouldFormatReplyForVoice(turn.executionState, turn.responseMode)
              ? formatHomeVoiceReply(finalized, trimmedTranscript)
              : finalized) || reply.trim();

          if (!spokenReply) {
            const recovery = buildAssistantRecoveryMessage(null, 'empty');
            const assistantMessage = finishAssistantTurn(recovery);
            playAssistantResponse(recovery, assistantMessage.id);
            return;
          }

          const finalReply = enforceCalendarReplyIfNeeded({
            userTranscript: trimmedTranscript,
            candidateReply: spokenReply,
            executionState: turn.calendarVerified ? 'executed' : 'drafted',
          });

          logAssistantReplyGenerated({
            source: 'llm',
            transcriptPreview: trimmedTranscript,
            replyPreview: finalReply,
            route: turn.route,
          });
          logAssistantConversation('[AssistantFinalize]', 'Voice LLM response ready', {
            length: finalReply.length,
          });
          const assistantMessage = finishAssistantTurn(finalReply);
          playAssistantResponse(finalReply, assistantMessage.id);
        } finally {
          requestAbort.dispose();
        }
      } catch (error) {
        if (isAbortError(error)) {
          const recovery = buildAssistantRecoveryMessage(null, 'timeout');
          logAssistantConversation('[AssistantTimeout]', 'Voice LLM request timed out');
          const assistantMessage = finishAssistantTurn(recovery);
          playAssistantResponse(recovery, assistantMessage.id);
          return;
        }

        const apiError = toApiError(error);
        console.log('[Voice] Error', apiError.message);

        const recovery =
          requiresCalendarToolExecution(trimmedTranscript) &&
          detectCalendarCommandIntent(trimmedTranscript) === 'update_calendar_event'
            ? buildCalendarMoveExceptionReply(languageCodeRef.current, apiError.message)
            : buildAssistantRecoveryMessage(apiError, 'failed');

        const assistantMessage = finishAssistantTurn(recovery);
        playAssistantResponse(recovery, assistantMessage.id);
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
    logMicButtonPressed();
    logMicStateBefore({
      voiceStatus: voiceStatusRef.current,
      hasActiveSession: voiceCaptureSessionRef.current?.status === 'active',
      isRecording: isRecordingRef.current,
    });

    if (
      voiceCaptureSessionRef.current?.status === 'active' ||
      isRecordingRef.current ||
      voiceStatusRef.current === 'listening'
    ) {
      stopActiveRecording();
      return;
    }

    if (voiceStatusRef.current === 'speaking') {
      stopSpeech();
      setVoiceStatus('idle');
      setStatusText('Ready');
      setHighlightedMessageId(null);
      return;
    }

    if (voiceStatusRef.current === 'processing') {
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
          resetVoiceUiToReady(
            'Microphone access was denied. Allow microphone permission in your browser settings and try again.',
          );
          setVoiceStatus('error');
          return;
        }
      }
    }

    const captureSession = startVoiceCapture({
      language: recognitionLocaleRef.current,
      maxRecordingMs: DEFAULT_VOICE_CAPTURE_MAX_MS,
      maxListeningMs: DEFAULT_VOICE_CAPTURE_MAX_MS,
      onStart: () => {
        isRecordingRef.current = true;
        clearRecordingEmergencyTimeout();
        recordingEmergencyTimeoutRef.current = setTimeout(() => {
          if (isRecordingRef.current) {
            stopActiveRecording();
          }
        }, DEFAULT_VOICE_CAPTURE_MAX_MS);
        setLiveTranscript('');
        setHeardTranscript('');
        setVoiceStatus('listening');
        setStatusText(
          Platform.OS === 'web' ? 'Listening...' : 'Recording... auto-stops after you pause.',
        );
      },
      onPartialTranscript: (transcript) => {
        setLiveTranscript(transcript);
        if (transcript === 'Transcribing...') {
          setStatusText('Transcribing...');
        }
      },
      onError: (message) => {
        resetVoiceUiToReady(message);
        setVoiceStatus('error');
      },
      onEnd: (transcript) => {
        isRecordingRef.current = false;
        clearRecordingEmergencyTimeout();
        releaseMicrophoneStream();
        voiceCaptureSessionRef.current = null;

        if (!transcript) {
          resetVoiceUiToReady();
          return;
        }

        setHeardTranscript(transcript);
        setLiveTranscript(transcript);
        logAssistantRequestStart({
          transcriptPreview: transcript.slice(0, 120),
          source: 'home_voice',
        });
        setVoiceStatus('processing');
        setStatusText('Thinking...');
        void sendTranscriptToAssistant(transcript);
      },
    });

    voiceCaptureSessionRef.current = captureSession;

    if (captureSession.status === 'unsupported') {
      resetVoiceUiToReady(captureSession.message);
      setVoiceStatus('error');
    }
  }, [
    clearRecordingEmergencyTimeout,
    releaseMicrophoneStream,
    resetVoiceUiToReady,
    sendTranscriptToAssistant,
    stopActiveRecording,
    stopAllVoiceOutput,
  ]);

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
