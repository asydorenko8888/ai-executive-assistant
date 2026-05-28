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
import {
  executiveChatThread,
  executiveChatMessages,
} from '@/src/features/chat/data/chatSeed';
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
  clearChatHistoryStorage,
  loadChatHistory,
  saveChatHistory,
} from '@/src/features/chat/storage/chatHistoryStorage';
import { startVoiceCapture, type VoiceCaptureSession } from '@/src/features/voice/voiceCapture';
import { toApiError } from '@/src/shared/api';

const assistantTypingLabel = 'Executive AI is structuring a recommendation';

function createMessage(role: ChatMessage['role'], content: string, createdAt: string): ChatMessage {
  return {
    id: `${role}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt,
    status: role === 'assistant' ? 'read' : 'sent',
  };
}

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function useExecutiveChat() {
  const {
    languageCode: voiceLanguage,
    recognitionLocale,
    setVoiceLanguage,
  } = useVoiceLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>(executiveChatMessages);
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
  const [isHistoryHydrated, setIsHistoryHydrated] = useState(false);
  const hasRestoredHistoryRef = useRef(false);
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

  useEffect(() => {
    if (hasRestoredHistoryRef.current) {
      return;
    }

    hasRestoredHistoryRef.current = true;
    let isMounted = true;

    const restoreChatHistory = async () => {
      const restoredMessages = await loadChatHistory(executiveChatMessages);

      if (!isMounted) {
        return;
      }

      setMessages(restoredMessages);
      setIsHistoryHydrated(true);
    };

    void restoreChatHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  const appendStreamToken = useCallback((assistantMessageId: string, token: string) => {
    setMessages((currentMessages) => {
      const existingMessage = currentMessages.find((message) => message.id === assistantMessageId);

      if (!existingMessage) {
        const nextAssistantMessage = createMessage('assistant', token, getCurrentTimeLabel());

        return [
          ...currentMessages,
          {
            ...nextAssistantMessage,
            id: assistantMessageId,
            status: 'streaming',
          },
        ];
      }

      return currentMessages.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content: `${message.content}${token}`,
              status: 'streaming',
            }
          : message,
      );
    });
  }, []);

  const finalizeAssistantMessage = useCallback((assistantMessageId: string, content: string) => {
    setMessages((currentMessages) => {
      const existingMessage = currentMessages.find((message) => message.id === assistantMessageId);

      if (!existingMessage) {
        return [...currentMessages, createMessage('assistant', content, getCurrentTimeLabel())];
      }

      return currentMessages.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content: content || message.content,
              status: 'read',
            }
          : message,
      );
    });
  }, []);

  const demoteStreamingMessage = useCallback((assistantMessageId: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantMessageId && message.status === 'streaming'
          ? {
              ...message,
              status: 'delivered',
            }
          : message,
      ),
    );
  }, []);

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
    (orchestrator: Awaited<ReturnType<typeof createExecutiveAgentOrchestrator>>) => {
      const referenceNow = new Date(orchestrator.context.now);
      const calendarEvents = getAssistantVisibleCalendarEvents(orchestrator.snapshot, referenceNow);
      const runtimeContext = buildAgentRuntimeContext(orchestrator, voiceLanguage);

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
        createMessage(
          'system',
          `Executive runtime context: ${runtimeContext} Use it subtly and only when it genuinely sharpens the reply.`,
          getCurrentTimeLabel(),
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

        const humanizedReply = tryBuildHumanizedCalendarReply({
          transcript: latestUserMessage.content.trim(),
          visibleEvents: calendarEvents,
          languageCode: voiceLanguage,
          referenceNow,
        });

        if (humanizedReply) {
          return humanizedReply.responseText;
        }
      }

      const memoryContext = await prepareMemoryPromptContext(nextMessages);
      const agentSystemMessages = buildAgentSystemMessages(orchestrator);

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
          appendStreamToken(assistantMessageId, token);
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
      void syncLongTermMemory([
        ...variables.nextMessages,
        createMessage('assistant', assistantReply, getCurrentTimeLabel()),
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

  useEffect(() => {
    if (!isHistoryHydrated) {
      return;
    }

    if (chatMutation.isPending || isStreamingAssistant || typingState.isActive) {
      return;
    }

    void saveChatHistory(messages);
  }, [chatMutation.isPending, isHistoryHydrated, isStreamingAssistant, messages, typingState.isActive]);

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

    const createdAt = getCurrentTimeLabel();
    const userMessage = createMessage('user', trimmedMessage, createdAt);
    const nextMessages = [...messages, userMessage];
    const assistantMessageId = `assistant-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    hasReceivedStreamTokenRef.current = false;
    setMessages(nextMessages);
    setTypingState({
      isActive: true,
      label: assistantTypingLabel,
    });
    setIsStreamingAssistant(false);
    chatMutation.mutate({
      nextMessages,
      assistantMessageId,
    });
  }, [chatMutation, clearTimers, isStreamingAssistant, messages]);

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
    setMessages(executiveChatMessages);
    await clearChatHistoryStorage();
  }, [chatMutation, clearTimers, clearVoiceStatus, resetStreamingState]);

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
