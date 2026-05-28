import { create } from 'zustand';

import type { ChatMessage, ChatMessageStatus } from '@/src/entities/chat/types';
import { executiveChatMessages } from '@/src/features/chat/data/chatSeed';
import {
  clearChatHistoryStorage,
  loadChatHistory,
  saveChatHistory,
} from '@/src/features/chat/storage/chatHistoryStorage';

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createConversationMessage(
  role: ChatMessage['role'],
  content: string,
  status?: ChatMessageStatus,
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: getCurrentTimeLabel(),
    status: status ?? (role === 'assistant' ? 'read' : 'sent'),
  };
}

function isConversationRole(role: ChatMessage['role']) {
  return role === 'user' || role === 'assistant';
}

type ExecutiveConversationState = {
  messages: ChatMessage[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  appendUserMessage: (content: string) => ChatMessage;
  appendAssistantMessage: (content: string, status?: ChatMessageStatus) => ChatMessage;
  upsertAssistantMessage: (id: string, content: string, status?: ChatMessageStatus) => void;
  appendAssistantToken: (id: string, token: string) => void;
  clearConversation: () => Promise<void>;
  persist: () => Promise<void>;
};

let hydratePromise: Promise<void> | null = null;

export const useExecutiveConversationStore = create<ExecutiveConversationState>((set, get) => ({
  messages: [],
  isHydrated: false,

  hydrate: async () => {
    if (get().isHydrated) {
      return;
    }

    if (!hydratePromise) {
      hydratePromise = (async () => {
        const restored = await loadChatHistory(executiveChatMessages);
        set({ messages: restored, isHydrated: true });
      })();
    }

    await hydratePromise;
  },

  setMessages: (messages) => {
    set({ messages });
  },

  appendUserMessage: (content) => {
    const message = createConversationMessage('user', content.trim(), 'sent');
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  appendAssistantMessage: (content, status = 'read') => {
    const message = createConversationMessage('assistant', content.trim(), status);
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  upsertAssistantMessage: (id, content, status = 'read') => {
    set((state) => {
      const existing = state.messages.find((message) => message.id === id);

      if (!existing) {
        return {
          messages: [
            ...state.messages,
            {
              id,
              role: 'assistant',
              content,
              createdAt: getCurrentTimeLabel(),
              status,
            },
          ],
        };
      }

      return {
        messages: state.messages.map((message) =>
          message.id === id
            ? {
                ...message,
                content,
                status,
              }
            : message,
        ),
      };
    });
  },

  appendAssistantToken: (id, token) => {
    set((state) => {
      const existing = state.messages.find((message) => message.id === id);

      if (!existing) {
        return {
          messages: [
            ...state.messages,
            {
              id,
              role: 'assistant',
              content: token,
              createdAt: getCurrentTimeLabel(),
              status: 'streaming',
            },
          ],
        };
      }

      return {
        messages: state.messages.map((message) =>
          message.id === id
            ? {
                ...message,
                content: `${message.content}${token}`,
                status: 'streaming',
              }
            : message,
        ),
      };
    });
  },

  clearConversation: async () => {
    set({ messages: [] });
    await clearChatHistoryStorage();
  },

  persist: async () => {
    const { messages, isHydrated } = get();

    if (!isHydrated) {
      return;
    }

    await saveChatHistory(messages);
  },
}));

export function selectConversationMessages(messages: ChatMessage[]) {
  return messages.filter((message) => isConversationRole(message.role));
}

export function getConversationPayloadMessages(messages: ChatMessage[]) {
  return messages.filter((message) => isConversationRole(message.role));
}
