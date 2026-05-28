import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useMutation } from '@tanstack/react-query';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import {
  buildAgentRuntimeContext,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import { tryBuildHumanizedCalendarReply } from '@/src/features/agent/calendar/calendarHumanizedReply';
import { formatVoiceResponse } from '@/src/features/voice/speech/voiceSpeechFormatter';
import { executiveChatThread } from '@/src/features/chat/data/chatSeed';
import { useHydrateExecutiveConversation } from '@/src/features/chat/hooks/useHydrateExecutiveConversation';
import {
  extractMeaningfulMemories,
  loadLongTermMemories,
  prepareMemoryPromptContext,
  upsertLongTermMemories,
} from '@/src/features/chat/memory';
import { streamExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  createConversationMessage,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';
import { buildVoiceSessionContext } from '@/src/features/voice/memory';
import { buildVoiceSessionMemoryFromMessages } from '@/src/features/voice/memory/voiceSessionFromMessages';
import { startVoiceCapture, type VoiceCaptureSession } from '@/src/features/voice/voiceCapture';
import { toApiError } from '@/src/shared/api';

const assistantTypingLabel = 'Executive AI is structuring a recommendation';

export function useExecutiveChat() {
  const {
    languageCode: voiceLanguage,
    recognitionLocale,
    setVoiceLanguage,
  } = useVoiceLanguage();
  const isHistoryHydrated = useHydrateExecutiveConversation();
  const messages = useExecutiveConversationStore((state) => state.messages);
  const appendUserMessage = useExecutiveConversationStore((state) => state.appendUserMessage);
  const appendAssistantToken = useExecutiveConversationStore((state) => state.appendAssistantToken);
  const upsertAssistantMessage = useExecutiveConversationStore((state) => state.upsertAssistantMessage);
  const clearConversation = useExecutiveConversationStore((state) => state.clearConversation);
  const persistConversation = useExecutiveConversationStore((state) => state.persist);
  const [draft, setDraft] = useState('');
  const [typingState, setTypingState] = useState<ChatTypingState>({
    isActive: false,
    label: assistantTypingLabel,
  });
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [isStreamingAssistant, setIsStreamingAssistant] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceStatusLabel, setVoiceStatusLabel] = useState<string | null>(null);
  const [voiceStatusTone, setVoiceStatusTone] = useState<'neutral' | 'error'>('neutral');
  const hasHydratedMemoryRef = useRef(false);
  const hasReceivedStreamTokenRef = useRef(false);
  const voiceSessionRef = useRef<VoiceCaptureSession | null>(null);
  const voiceStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preserveVoiceStatusOnEndRef = useRef(false);
  const draftSnapshotBeforeVoiceRef = useRef('');

  const clearVoiceStatus = useCallback(() => {
    if (voiceStatusTimeoutRef.current) {
      clearTimeout(voiceStatusTimeoutRef.current);
      voiceStatusTimeoutRef.current = null;
    }

    setVoiceStatusLabel(null);
    setVoiceStatusTone('neutral');
    preserveVoiceStatusOnEndRef.current = false;
  }, []);

  const setTemporaryVoiceStatus = useCallback(
    (label: string, tone: 'neutral' | 'error' = 'neutral', timeoutMs = 3200) => {
      if (voiceStatusTimeoutRef.current) {
        clearTimeout(voiceStatusTimeoutRef.current);
      }

      preserveVoiceStatusOnEndRef.current = true;
      setVoiceStatusLabel(label);
      setVoiceStatusTone(tone);

      voiceStatusTimeoutRef.current = setTimeout(() => {
        clearVoiceStatus();
      }, timeoutMs);
    },
    [clearVoiceStatus],
  );

  const clearTimers = useCallback(() => {
    if (voiceSessionRef.current?.status === 'active') {
      voiceSessionRef.current.stop();
    }

    voiceSessionRef.current = null;
    if (voiceStatusTimeoutRef.current) {
      clearTimeout(voiceStatusTimeoutRef.current);
      voiceStatusTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finalizeAssistantMessage = useCallback(
    (assistantMessageId: string, content: string) => {
      upsertAssistantMessage(assistantMessageId, content, 'read');
    },
    [upsertAssistantMessage],
  );

  const demoteStreamingMessage = useCallback(
    (assistantMessageId: string) => {
      const existing = useExecutiveConversationStore
        .getState()
        .messages.find((message) => message.id === assistantMessageId);

      if (existing) {
        upsertAssistantMessage(assistantMessageId, existing.content, 'delivered');
      }
    },
    [upsertAssistantMessage],
  );

  const resetStreamingState = useCallback(() => {
    hasReceivedStreamTokenRef.current = false;
    setIsStreamingAssistant(false);
    setTypingState({
      isActive: false,
      label: assistantTypingLabel,
    });
  }, []);

  const syncLongTermMemory = useCallback(async (conversationMessages: ChatMessage[]) => {
    const existingMemories = await loadLongTermMemories();
    const memoryCandidates = extractMeaningfulMemories(conversationMessages, existingMemories);

    if (memoryCandidates.length === 0) {
      return;
    }

    await upsertLongTermMemories(memoryCandidates);
  }, []);

  const buildAgentSystemMessages = useCallback(
    (
      orchestrator: Awaited<ReturnType<typeof createExecutiveAgentOrchestrator>>,
      userTranscript?: string,
    ) => {
      const referenceNow = new Date(orchestrator.context.now);
      const calendarEvents = getAssistantVisibleCalendarEvents(orchestrator.snapshot, referenceNow);
      const runtimeContext = buildAgentRuntimeContext(orchestrator, voiceLanguage, userTranscript);

      console.log(
        '[Voice Test] assistantPayload.calendarEvents',
        calendarEvents.map((event) => ({
          title: event.title,
          startsAt: event.startsAt,
          location: event.location ?? null,
        })),
      );

      if (!runtimeContext) {
        return [] as ChatMessage[];
      }

      return [
        createConversationMessage(
          'system',
          `Executive runtime context: ${runtimeContext} Use it subtly and only when it genuinely sharpens the reply.`,
        ),
      ];
    },
    [voiceLanguage],
  );

  const chatMutation = useMutation({
    mutationFn: async ({
      nextMessages,
      assistantMessageId,
    }: {
      nextMessages: ChatMessage[];
      assistantMessageId: string;
    }) => {
      const latestUserMessage = [...nextMessages].reverse().find((message) => message.role === 'user');
      const orchestrator = await createExecutiveAgentOrchestrator({
        locale: getChatLocaleFromVoiceLanguage(voiceLanguage),
        chatMessages: nextMessages,
      });
      const referenceNow = new Date(orchestrator.context.now);
      const calendarEvents = getAssistantVisibleCalendarEvents(orchestrator.snapshot, referenceNow);

      if (latestUserMessage?.content.trim()) {
        console.log('[Voice Test] transcript', latestUserMessage.content.trim());

        const sessionContext = buildVoiceSessionContext(
          buildVoiceSessionMemoryFromMessages(nextMessages),
        );
        const humanizedReply = tryBuildHumanizedCalendarReply({
          transcript: latestUserMessage.content.trim(),
          visibleEvents: calendarEvents,
          languageCode: voiceLanguage,
          referenceNow,
          sessionContext,
        });

        if (humanizedReply) {
          return humanizedReply.responseText;
        }
      }

      const memoryContext = await prepareMemoryPromptContext(nextMessages);
      const agentSystemMessages = buildAgentSystemMessages(
        orchestrator,
        latestUserMessage?.content.trim(),
      );

      return streamExecutiveChatMessage({
        messages: nextMessages,
        systemMessages: [...memoryContext.systemMessages, ...agentSystemMessages],
        onToken: (token) => {
          hasReceivedStreamTokenRef.current = true;
          setTypingState({
            isActive: false,
            label: assistantTypingLabel,
          });
          setIsStreamingAssistant(true);
          appendAssistantToken(assistantMessageId, token);
        },
      });
    },
    onSuccess: (assistantReply, variables) => {
      const displayReply = formatVoiceResponse(assistantReply, {
        maxSentences: 4,
        locale: getChatLocaleFromVoiceLanguage(voiceLanguage),
      });
      console.log('[Voice Test] responseText', displayReply || assistantReply);
      finalizeAssistantMessage(variables.assistantMessageId, displayReply || assistantReply);
      resetStreamingState();
      void persistConversation();
      void syncLongTermMemory([
        ...variables.nextMessages,
        createConversationMessage('assistant', assistantReply),
      ]);
    },
    onError: (error, variables) => {
      const apiError = toApiError(error);

      if (hasReceivedStreamTokenRef.current) {
        demoteStreamingMessage(variables.assistantMessageId);
      }

      resetStreamingState();
      setErrorMessage(apiError.message);
    },
  });

  const messageCount = messages.length;
  const lastMessageSignature =
    messages.length > 0
      ? `${messages[messages.length - 1]?.id}:${messages[messages.length - 1]?.content.length}`
      : 'empty';

  useEffect(() => {
    if (!isHistoryHydrated) {
      return;
    }

    if (chatMutation.isPending || isStreamingAssistant || typingState.isActive) {
      return;
    }

    void persistConversation();
  }, [
    chatMutation.isPending,
    isHistoryHydrated,
    isStreamingAssistant,
    lastMessageSignature,
    messageCount,
    persistConversation,
    typingState.isActive,
  ]);

  useEffect(() => {
    if (!isHistoryHydrated || hasHydratedMemoryRef.current) {
      return;
    }

    hasHydratedMemoryRef.current = true;
    void syncLongTermMemory(messages);
  }, [isHistoryHydrated, messages, syncLongTermMemory]);

  const submitUserMessage = useCallback((content: string) => {
    const trimmedMessage = content.trim();

    if (!trimmedMessage) {
      return;
    }

    if (chatMutation.isPending || isStreamingAssistant) {
      return;
    }

    clearTimers();
    setErrorMessage(null);

    appendUserMessage(trimmedMessage);
    const nextMessages = [...useExecutiveConversationStore.getState().messages];
    const assistantMessageId = `assistant-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    hasReceivedStreamTokenRef.current = false;
    void persistConversation();
    setTypingState({
      isActive: true,
      label: assistantTypingLabel,
    });
    setIsStreamingAssistant(false);
    chatMutation.mutate({
      nextMessages,
      assistantMessageId,
    });
  }, [appendUserMessage, chatMutation, clearTimers, isStreamingAssistant, persistConversation]);

  const sendDraft = useCallback(() => {
    const nextDraft = draft.trim();

    if (!nextDraft) {
      return;
    }

    setDraft('');
    submitUserMessage(nextDraft);
  }, [draft, submitUserMessage]);

  const sendVoicePrompt = useCallback(() => {
    if (voiceSessionRef.current?.status === 'active') {
      voiceSessionRef.current.stop();
      return;
    }

    if (chatMutation.isPending || isStreamingAssistant) {
      return;
    }

    if (isVoiceProcessing) {
      return;
    }

    clearTimers();
    clearVoiceStatus();
    draftSnapshotBeforeVoiceRef.current = draft.trim();

    const voiceSession = startVoiceCapture({
      language: recognitionLocale,
      maxListeningMs: 15000,
      speechEndDelayMs: 1800,
      onStart: () => {
        preserveVoiceStatusOnEndRef.current = false;
        setIsVoiceProcessing(true);
        setVoiceStatusTone('neutral');
        setVoiceStatusLabel(
          Platform.OS === 'web' ? 'Listening...' : 'Recording... tap again to send.',
        );
      },
      onPartialTranscript: (transcript) => {
        if (Platform.OS === 'web') {
          const prefix = draftSnapshotBeforeVoiceRef.current;
          const nextDraft = prefix ? `${prefix} ${transcript}`.trim() : transcript;
          setDraft(nextDraft);
        }

        setVoiceStatusTone('neutral');
        setVoiceStatusLabel(
          Platform.OS === 'web' ? 'Listening...' : transcript === 'Transcribing...' ? 'Transcribing...' : 'Recording...',
        );
      },
      onError: (message) => {
        setIsVoiceProcessing(false);
        setTemporaryVoiceStatus(message, 'error', 4200);
        voiceSessionRef.current = null;
      },
      onEnd: (transcript) => {
        setIsVoiceProcessing(false);
        voiceSessionRef.current = null;

        if (!transcript) {
          if (!preserveVoiceStatusOnEndRef.current) {
            clearVoiceStatus();
          }
          return;
        }

        if (Platform.OS === 'web') {
          const prefix = draftSnapshotBeforeVoiceRef.current;
          setDraft(prefix ? `${prefix} ${transcript}`.trim() : transcript);
          clearVoiceStatus();
          return;
        }

        clearVoiceStatus();
        submitUserMessage(transcript);
      },
    });

    if (voiceSession.status === 'unsupported') {
      setTemporaryVoiceStatus(voiceSession.message, 'error', 5000);
      setIsVoiceProcessing(false);
      return;
    }

    voiceSessionRef.current = voiceSession;
  }, [
    chatMutation.isPending,
    clearTimers,
    clearVoiceStatus,
    draft,
    isStreamingAssistant,
    isVoiceProcessing,
    recognitionLocale,
    setTemporaryVoiceStatus,
    submitUserMessage,
  ]);

  const lastUserMessage = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === 'user')?.content ?? null;
  }, [messages]);

  const thread = useMemo(() => {
    const lastMessage = messages[messages.length - 1];

    return {
      ...executiveChatThread,
      updatedAt: lastMessage?.createdAt ?? executiveChatThread.updatedAt,
      lastMessage,
    };
  }, [messages]);

  const resetChatHistory = useCallback(async () => {
    clearTimers();
    chatMutation.reset();
    resetStreamingState();
    setDraft('');
    setErrorMessage(null);
    setIsVoiceProcessing(false);
    clearVoiceStatus();
    await clearConversation();
  }, [chatMutation, clearConversation, clearTimers, clearVoiceStatus, resetStreamingState]);

  return {
    thread,
    messages,
    draft,
    setDraft,
    sendDraft,
    sendVoicePrompt,
    typingState,
    isVoiceProcessing,
    lastUserMessage,
    errorMessage,
    clearError: () => setErrorMessage(null),
    resetChatHistory,
    isAwaitingAssistant: chatMutation.isPending,
    isStreamingAssistant,
    hasDraft: draft.trim().length > 0,
    voiceStatusLabel,
    voiceStatusTone,
    voiceLanguage,
    setVoiceLanguage,
  };
}
