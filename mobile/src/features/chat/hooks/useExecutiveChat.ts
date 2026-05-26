import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import {
  chatVoicePrompt,
  executiveChatMessages,
  executiveChatThread,
} from '@/src/features/chat/data/chatSeed';
import { sendExecutiveChatMessage } from '@/src/features/chat/services/openAiChatService';
import { toApiError } from '@/src/shared/api';
import { env } from '@/src/shared/config';

const assistantTypingLabel = 'AI is preparing a response';
const missingApiKeyMessage =
  'OpenAI API key is missing. Add EXPO_PUBLIC_OPENAI_API_KEY to your local .env file to enable real AI chat.';

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
  const [messages, setMessages] = useState<ChatMessage[]>(executiveChatMessages);
  const [draft, setDraft] = useState('');
  const [typingState, setTypingState] = useState<ChatTypingState>({
    isActive: false,
    label: assistantTypingLabel,
  });
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasOpenAiApiKey = env.openAiApiKey.trim().length > 0;

  const clearTimers = useCallback(() => {
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const chatMutation = useMutation({
    mutationFn: sendExecutiveChatMessage,
    onSuccess: (assistantReply) => {
      const assistantMessage = createMessage('assistant', assistantReply, getCurrentTimeLabel());

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      setTypingState({
        isActive: false,
        label: assistantTypingLabel,
      });
    },
    onError: (error) => {
      const apiError = toApiError(error);

      setTypingState({
        isActive: false,
        label: assistantTypingLabel,
      });
      setErrorMessage(apiError.message);
    },
  });

  const submitUserMessage = useCallback((content: string) => {
    const trimmedMessage = content.trim();

    if (!trimmedMessage) {
      return;
    }

    if (!hasOpenAiApiKey) {
      setErrorMessage(missingApiKeyMessage);
      return;
    }

    clearTimers();
    setErrorMessage(null);

    const createdAt = getCurrentTimeLabel();
    const userMessage = createMessage('user', trimmedMessage, createdAt);
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setTypingState({
      isActive: true,
      label: assistantTypingLabel,
    });
    chatMutation.mutate(nextMessages);
  }, [chatMutation, clearTimers, hasOpenAiApiKey, messages]);

  const sendDraft = useCallback(() => {
    const nextDraft = draft.trim();

    if (!nextDraft) {
      return;
    }

    setDraft('');
    submitUserMessage(nextDraft);
  }, [draft, submitUserMessage]);

  const sendVoicePrompt = useCallback(() => {
    if (isVoiceProcessing || chatMutation.isPending) {
      return;
    }

    if (!hasOpenAiApiKey) {
      setErrorMessage(missingApiKeyMessage);
      return;
    }

    clearTimers();
    setErrorMessage(null);
    setIsVoiceProcessing(true);
    setTypingState({
      isActive: true,
      label: 'Listening for your voice prompt',
    });

    voiceTimeoutRef.current = setTimeout(() => {
      setIsVoiceProcessing(false);
      submitUserMessage(chatVoicePrompt);
    }, 900);
  }, [chatMutation.isPending, clearTimers, hasOpenAiApiKey, isVoiceProcessing, submitUserMessage]);

  const lastUserMessage = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === 'user')?.content ?? null;
  }, [messages]);

  const persistentConfigurationError = hasOpenAiApiKey ? null : missingApiKeyMessage;

  return {
    thread: executiveChatThread,
    messages,
    draft,
    setDraft,
    sendDraft,
    sendVoicePrompt,
    typingState,
    isVoiceProcessing,
    lastUserMessage,
    errorMessage: errorMessage ?? persistentConfigurationError,
    clearError: () => setErrorMessage(null),
    hasOpenAiApiKey,
    isAwaitingAssistant: chatMutation.isPending,
    hasDraft: draft.trim().length > 0,
  };
}
