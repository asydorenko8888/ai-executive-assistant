import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import {
  buildAgentSystemContextSegments,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import { isCalendarAgendaQuery } from '@/src/features/agent/calendar/calendarAgendaSync';
import { warnIfFalseExecutionClaim, enforceCalendarReplyIfNeeded } from '@/src/features/agent/capabilityHonesty';
import {
  finalizeTurnReply,
  readFreshConversationMessages,
  resolveAssistantTurn,
  shouldFormatReplyForVoice,
  type AssistantTurnRoute,
} from '@/src/features/agent/conversation/assistantTurnPipeline';
import { blockConversationalCalendarRetryLoop } from '@/src/features/agent/execution/calendarRetryPhraseGuard';
import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { AssistantResponseMode } from '@/src/features/agent/factual/factualTimeGrounding';
import {
  runCalendarAuthAndResume,
  type CalendarOperationalUxPhase,
} from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import {
  classifyCalendarAgendaQueryIntent,
  formatVoiceResponse,
} from '@/src/features/voice/speech/voiceSpeechFormatter';
import { executiveChatThread } from '@/src/features/chat/data/chatSeed';
import {
  createAssistantRequestCoordinator,
  getAssistantPartialContent,
  type ActiveAssistantRequest,
} from '@/src/features/chat/hooks/assistantRequestCoordinator';
import { useHydrateExecutiveConversation } from '@/src/features/chat/hooks/useHydrateExecutiveConversation';
import {
  extractMeaningfulMemories,
  loadLongTermMemories,
  prepareMemoryPromptContext,
  upsertLongTermMemories,
} from '@/src/features/chat/memory';
import { buildShortTermMemory } from '@/src/features/chat/memory/shortTermMemory';
import {
  isAbortError,
  logAssistantConversation,
} from '@/src/features/chat/services/assistantConversationLifecycle';
import {
  blockLlmForCalendarMutation,
  requiresCalendarToolExecution,
} from '@/src/features/agent/calendar/calendarToolExecutionGate';
import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import { getCalendarCommandTerminalReply } from '@/src/features/agent/calendar/calendarCommandExecutor';
import { refreshHomeBriefing } from '@/src/features/home/services/refreshHomeBriefing';
import { streamExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  createConversationMessage,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';
import { startVoiceCapture, type VoiceCaptureSession } from '@/src/features/voice/voiceCapture';
import { toApiError } from '@/src/shared/api';

const assistantTypingLabel = 'Executive AI is structuring a recommendation';

type ChatMutationVariables = {
  assistantMessageId: string;
  requestId: string;
};

type ChatMutationResult = {
  reply: string;
  spokenReply?: string;
  requestId: string;
  route: AssistantTurnRoute;
  executionState: AssistantExecutionState;
  responseMode: AssistantResponseMode;
  calendarVerified?: boolean;
};

export function useExecutiveChat() {
  const queryClient = useQueryClient();
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
  const [calendarOperationalUx, setCalendarOperationalUx] = useState<CalendarOperationalUxPhase>('idle');
  const [calendarOperationalLabel, setCalendarOperationalLabel] = useState<string | null>(null);
  const [isCalendarOAuthInFlight, setIsCalendarOAuthInFlight] = useState(false);
  const hasHydratedMemoryRef = useRef(false);
  const hasReceivedStreamTokenRef = useRef(false);
  const voiceSessionRef = useRef<VoiceCaptureSession | null>(null);
  const voiceStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preserveVoiceStatusOnEndRef = useRef(false);
  const draftSnapshotBeforeVoiceRef = useRef('');
  const assistantRequestCoordinatorRef = useRef(createAssistantRequestCoordinator());
  const chatMutationRef = useRef<ReturnType<typeof useMutation<ChatMutationResult, Error, ChatMutationVariables>> | null>(null);

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

  const resetStreamingState = useCallback(() => {
    hasReceivedStreamTokenRef.current = false;
    setIsStreamingAssistant(false);
    setTypingState({
      isActive: false,
      label: assistantTypingLabel,
    });
  }, []);

  const finalizeAssistantMessage = useCallback(
    (assistantMessageId: string, content: string, terminalState: 'completed' | 'failed' | 'timeout' | 'interrupted') => {
      logAssistantConversation('[AssistantFinalize]', 'Committing assistant message', {
        assistantMessageId,
        terminalState,
        length: content.length,
      });
      upsertAssistantMessage(assistantMessageId, content, 'read');
    },
    [upsertAssistantMessage],
  );

  const persistConversationSafe = useCallback(async () => {
    try {
      await persistConversation();
      logAssistantConversation('[AssistantPersist]', 'Conversation persisted');
    } catch (error) {
      console.warn('[AssistantPersist] Failed to persist conversation', error);
    }
  }, [persistConversation]);

  const handleAssistantInactivityTimeout = useCallback(
    (request: ActiveAssistantRequest) => {
      if (request.finalized) {
        return;
      }

      request.finalized = true;
      request.terminalState = 'timeout';
      request.abortController.abort();

      const recovery = assistantRequestCoordinatorRef.current.buildRecoveryForRequest(
        request.assistantMessageId,
        'timeout',
      );

      finalizeAssistantMessage(request.assistantMessageId, recovery, 'timeout');
      assistantRequestCoordinatorRef.current.finalizeRequest(request.requestId);
      assistantRequestCoordinatorRef.current.clear(request.requestId);
      resetStreamingState();
      chatMutationRef.current?.reset();
      void persistConversationSafe();
    },
    [finalizeAssistantMessage, persistConversationSafe, resetStreamingState],
  );

  const syncLongTermMemory = useCallback(async (conversationMessages: ChatMessage[]) => {
    const existingMemories = await loadLongTermMemories();
    const memoryCandidates = extractMeaningfulMemories(conversationMessages, existingMemories);

    if (memoryCandidates.length === 0) {
      return;
    }

    await upsertLongTermMemories(memoryCandidates);
  }, []);

  const buildAgentSystemMessages = useCallback(
    async (
      orchestrator: Awaited<ReturnType<typeof createExecutiveAgentOrchestrator>>,
      userTranscript?: string,
    ) => {
      const referenceNow = new Date(orchestrator.context.now);
      const calendarEvents = getAssistantVisibleCalendarEvents(orchestrator.snapshot, referenceNow);
      console.log(
        '[Voice Test] assistantPayload.calendarEvents',
        calendarEvents.map((event) => ({
          title: event.title,
          startsAt: event.startsAt,
          location: event.location ?? null,
        })),
      );

      const segments = await buildAgentSystemContextSegments(
        orchestrator,
        voiceLanguage,
        userTranscript,
      );

      return segments.map((segment) =>
        createConversationMessage(
          'system',
          `${segment} Use it subtly and only when it genuinely sharpens the reply.`,
        ),
      );
    },
    [voiceLanguage],
  );

  const chatMutation = useMutation<ChatMutationResult, Error, ChatMutationVariables>({
    mutationFn: async ({ assistantMessageId, requestId }) => {
      const coordinator = assistantRequestCoordinatorRef.current;
      coordinator.touch(requestId);

      const nextMessages = readFreshConversationMessages();
      const orchestrator = await createExecutiveAgentOrchestrator({
        locale: getChatLocaleFromVoiceLanguage(voiceLanguage),
        chatMessages: nextMessages,
      });
      coordinator.touch(requestId);

      const referenceNow = new Date(orchestrator.context.now);
      const turn = await resolveAssistantTurn({
        messages: nextMessages,
        orchestrator,
        languageCode: voiceLanguage,
        referenceNow,
        enableVoiceShortcuts: false,
      });

      if (
        turn.operationalStarted ||
        turn.route === 'operational_local' ||
        turn.route === 'clarification_local'
      ) {
        const operationalReply = turn.reply?.trim() || getCalendarCommandTerminalReply(turn.userTranscript) ||
          buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'calendar command did not produce a terminal tool reply',
          );

        coordinator.touch(requestId);

        if (turn.requiresCalendarAuth) {
          if (isCalendarOAuthInFlight) {
            return {
              reply: operationalReply,
              spokenReply: turn.spokenReply,
              requestId,
              route: turn.route,
              executionState: turn.executionState,
              responseMode: turn.responseMode,
              calendarVerified: false,
            };
          }

          setCalendarOperationalUx('auth_required');
          setCalendarOperationalLabel(operationalReply);

          if (Platform.OS === 'web') {
            setIsCalendarOAuthInFlight(true);
            const { connectGoogleCalendarAccount } = await import(
              '@/src/features/agent/calendar/googleCalendarAuth'
            );
            void connectGoogleCalendarAccount();
          } else {
            setIsCalendarOAuthInFlight(true);
            setCalendarOperationalUx('connecting');

            const resumedReply = await runCalendarAuthAndResume(voiceLanguage);
            setIsCalendarOAuthInFlight(false);

            if (resumedReply) {
              setCalendarOperationalUx('event_created');
              setCalendarOperationalLabel(null);

              return {
                reply: resumedReply.reply,
                spokenReply: resumedReply.spokenReply,
                requestId,
                route: turn.route,
                executionState: 'tool_success',
                responseMode: 'operational',
                calendarVerified: resumedReply.verified,
              };
            }

            setCalendarOperationalUx('auth_required');
          }

          return {
            reply: operationalReply,
            requestId,
            route: turn.route,
            executionState: turn.executionState,
            responseMode: turn.responseMode,
          };
        }

        return {
          reply: operationalReply,
          spokenReply: turn.spokenReply,
          requestId,
          route: turn.route,
          executionState: turn.executionState,
          responseMode: 'operational',
          calendarVerified: turn.calendarVerified,
        };
      }

      if (requiresCalendarToolExecution(turn.userTranscript)) {
        const forced =
          blockLlmForCalendarMutation({
            transcript: turn.userTranscript,
            reason: 'operational route missing tool reply',
          }) ??
          buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'calendar command blocked LLM — no tool result',
          );

        return {
          reply: forced,
          spokenReply: forced,
          requestId,
          route: 'operational_local',
          executionState: 'tool_failure',
          responseMode: 'operational',
          calendarVerified: false,
        };
      }

      if (turn.reply) {
        coordinator.touch(requestId);

        return {
          reply: turn.reply,
          spokenReply: turn.spokenReply,
          requestId,
          route: turn.route,
          executionState: turn.executionState,
          responseMode: turn.responseMode,
          calendarVerified: turn.calendarVerified,
        };
      }

      const memoryContext = isCalendarAgendaQuery(turn.userTranscript)
        ? {
            systemMessages: [],
            shortTermMemory: buildShortTermMemory(nextMessages),
            relevantLongTermMemories: [],
          }
        : await prepareMemoryPromptContext(nextMessages);
      coordinator.touch(requestId);

      if (requiresCalendarToolExecution(turn.userTranscript)) {
        const forced =
          blockLlmForCalendarMutation({
            transcript: turn.userTranscript,
            reason: 'pre-stream guard',
          }) ??
          buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'calendar command blocked LLM stream',
          );

        return {
          reply: forced,
          spokenReply: forced,
          requestId,
          route: 'operational_local',
          executionState: 'tool_failure',
          responseMode: 'operational',
          calendarVerified: false,
        };
      }

      const agentSystemMessages = await buildAgentSystemMessages(orchestrator, turn.userTranscript);
      const activeRequest = coordinator.getActive();
      const signal = activeRequest?.abortController.signal;
      const intentSystemMessages = turn.intentPrompt
        ? [createConversationMessage('system', turn.intentPrompt)]
        : [];
      const visibleCalendarEvents = getAssistantVisibleCalendarEvents(
        orchestrator.snapshot,
        referenceNow,
      );

      const reply = await streamExecutiveChatMessage({
        messages: nextMessages,
        systemMessages: [
          ...memoryContext.systemMessages,
          ...agentSystemMessages,
          ...intentSystemMessages,
        ],
        signal,
        requestId,
        llmDebug: {
          calendarEvents: visibleCalendarEvents.map((event) => ({
            title: event.title,
            startsAt: event.startsAt,
          })),
        },
        onToken: (token) => {
          if (requiresCalendarToolExecution(turn.userTranscript)) {
            return;
          }

          coordinator.touch(requestId);
          hasReceivedStreamTokenRef.current = true;
          setTypingState({
            isActive: false,
            label: assistantTypingLabel,
          });
          setIsStreamingAssistant(true);
          appendAssistantToken(assistantMessageId, token);
        },
      });

      coordinator.touch(requestId);

      const trimmedReply = reply.trim();
      const partial = getAssistantPartialContent(assistantMessageId);

      if (!trimmedReply && partial) {
        return {
          reply: partial,
          requestId,
          route: turn.route,
          executionState: turn.executionState,
          responseMode: turn.responseMode,
        };
      }

      return {
        reply: trimmedReply,
        requestId,
        route: turn.route,
        executionState: turn.executionState,
        responseMode: turn.responseMode,
      };
    },
    onSuccess: async (result, variables) => {
      const coordinator = assistantRequestCoordinatorRef.current;

      if (!coordinator.isCurrentRequest(result.requestId)) {
        return;
      }

      const active = coordinator.getActive();

      if (!active || active.finalized) {
        return;
      }

      active.terminalState = 'completed';
      active.finalized = true;
      active.abortController.dispose();

      let assistantReply = result.reply.trim();
      const partial = getAssistantPartialContent(variables.assistantMessageId);

      if (!assistantReply) {
        assistantReply = coordinator.buildRecoveryForRequest(variables.assistantMessageId, 'empty');
      }

      const freshMessages = readFreshConversationMessages();
      const latestUser = [...freshMessages].reverse().find((message) => message.role === 'user');
      const latestUserTranscript = latestUser?.content.trim() ?? '';

      const operationalVoiceReply =
        result.responseMode === 'operational' && result.spokenReply?.trim()
          ? result.spokenReply.trim()
          : null;

      const displayReply = operationalVoiceReply
        ? operationalVoiceReply
        : shouldFormatReplyForVoice(result.executionState, result.responseMode)
          ? formatVoiceResponse(assistantReply, {
              maxSentences: 2,
              locale: getChatLocaleFromVoiceLanguage(voiceLanguage),
              userTranscript: latestUserTranscript,
              queryIntent: classifyCalendarAgendaQueryIntent(latestUserTranscript),
            })
          : assistantReply;
      const orchestrator = await createExecutiveAgentOrchestrator({
        locale: getChatLocaleFromVoiceLanguage(voiceLanguage),
        chatMessages: freshMessages,
      });
      const referenceNow = new Date(orchestrator.context.now);
      let candidateReply = displayReply || assistantReply;

      let committed = finalizeTurnReply({
        messages: freshMessages,
        orchestrator,
        languageCode: voiceLanguage,
        referenceNow,
        candidateReply,
      });

      committed = blockConversationalCalendarRetryLoop({
        userTranscript: latestUserTranscript,
        candidateReply: committed,
      });

      warnIfFalseExecutionClaim(committed, result.calendarVerified ? 'executed' : 'drafted');
      committed = enforceCalendarReplyIfNeeded({
        userTranscript: latestUserTranscript,
        candidateReply: committed,
        executionState: result.calendarVerified ? 'executed' : 'drafted',
      });

      if (result.calendarVerified && result.executionState === 'tool_success') {
        void refreshHomeBriefing(queryClient);
      }

      console.log('[Voice Test] responseText', committed);
      finalizeAssistantMessage(variables.assistantMessageId, committed, 'completed');
      coordinator.finalizeRequest(result.requestId);
      resetStreamingState();
      void persistConversationSafe();
      void syncLongTermMemory([
        ...freshMessages,
        createConversationMessage('assistant', committed),
      ]);
    },
    onError: (error, variables) => {
      const coordinator = assistantRequestCoordinatorRef.current;
      const active = coordinator.getActive();

      if (!active || active.requestId !== variables.requestId || active.finalized) {
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      active.terminalState = 'failed';
      active.finalized = true;
      active.abortController.dispose();

      const recovery = coordinator.buildRecoveryForRequest(variables.assistantMessageId, 'failed');
      finalizeAssistantMessage(variables.assistantMessageId, recovery, 'failed');
      coordinator.finalizeRequest(variables.requestId);
      resetStreamingState();

      const apiError = toApiError(error);
      setErrorMessage(apiError.message);
      void persistConversationSafe();
    },
    onSettled: (_result, _error, variables) => {
      assistantRequestCoordinatorRef.current.clear(variables.requestId);
      resetStreamingState();
    },
  });

  chatMutationRef.current = chatMutation;

  const messageCount = messages.length;
  const lastMessageSignature =
    messages.length > 0
      ? `${messages[messages.length - 1]?.id}:${messages[messages.length - 1]?.content.length}`
      : 'empty';

  useEffect(() => {
    if (!isHistoryHydrated) {
      return;
    }

    if (chatMutation.isPending || isStreamingAssistant) {
      return;
    }

    void persistConversationSafe();
  }, [
    chatMutation.isPending,
    isHistoryHydrated,
    isStreamingAssistant,
    lastMessageSignature,
    messageCount,
    persistConversationSafe,
  ]);

  useEffect(() => {
    if (!isHistoryHydrated || hasHydratedMemoryRef.current) {
      return;
    }

    hasHydratedMemoryRef.current = true;
    void syncLongTermMemory(messages);
  }, [isHistoryHydrated, messages, syncLongTermMemory]);

  const submitUserMessage = useCallback(
    (content: string) => {
      const trimmedMessage = content.trim();

      if (!trimmedMessage) {
        return;
      }

      clearTimers();
      setErrorMessage(null);

      appendUserMessage(trimmedMessage);
      const assistantMessageId = `assistant-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const request = assistantRequestCoordinatorRef.current.begin(
        assistantMessageId,
        handleAssistantInactivityTimeout,
      );

      hasReceivedStreamTokenRef.current = false;
      void persistConversationSafe();
      setTypingState({
        isActive: true,
        label: assistantTypingLabel,
      });
      setIsStreamingAssistant(false);

      logAssistantConversation('[Conversation]', 'User message submitted', {
        requestId: request.requestId,
        assistantMessageId,
      });

      chatMutation.mutate({
        assistantMessageId,
        requestId: request.requestId,
      });
    },
    [
      appendUserMessage,
      chatMutation,
      clearTimers,
      handleAssistantInactivityTimeout,
      persistConversationSafe,
    ],
  );

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

    if (chatMutation.isPending) {
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

  const connectGoogleCalendarForPendingAction = useCallback(async () => {
    setIsCalendarOAuthInFlight(true);
    setCalendarOperationalUx('connecting');

    const resumedOutcome = await runCalendarAuthAndResume(voiceLanguage);
    setIsCalendarOAuthInFlight(false);

    if (!resumedOutcome) {
      setCalendarOperationalUx('auth_required');
      return null;
    }

    setCalendarOperationalUx('event_created');
    setCalendarOperationalLabel(null);

    const assistantMessage = createConversationMessage('assistant', resumedOutcome.reply);
    upsertAssistantMessage(assistantMessage.id, resumedOutcome.reply);
    await persistConversation();

    return resumedOutcome.spokenReply;
  }, [persistConversation, upsertAssistantMessage, voiceLanguage]);

  const resetChatHistory = useCallback(async () => {
    const active = assistantRequestCoordinatorRef.current.getActive();

    if (active && !active.finalized) {
      active.terminalState = 'interrupted';
      active.finalized = true;
      active.abortController.abort();
      active.abortController.dispose();
    }

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
    calendarOperationalUx,
    calendarOperationalLabel,
    isCalendarOAuthInFlight,
    connectGoogleCalendarForPendingAction,
  };
}
