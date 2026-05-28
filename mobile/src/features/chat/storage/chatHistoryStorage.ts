import type { ChatMessage } from '@/src/entities/chat/types';
import { getStoredJson, removeStoredItem, setStoredJson } from '@/src/shared/storage';

const CHAT_HISTORY_STORAGE_KEY = 'executive-ai.chat-history.v2';

type ChatHistorySnapshot = {
  messages: ChatMessage[];
};

function normalizeStoredMessage(message: ChatMessage): ChatMessage {
  if (message.status === 'streaming') {
    return {
      ...message,
      status: 'delivered',
    };
  }

  return message;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ChatMessage>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.status === 'string'
  );
}

function isChatHistorySnapshot(value: unknown): value is ChatHistorySnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ChatHistorySnapshot>;

  return Array.isArray(candidate.messages) && candidate.messages.every(isChatMessage);
}

export async function loadChatHistory(fallbackMessages: ChatMessage[]): Promise<ChatMessage[]> {
  const fallbackSnapshot: ChatHistorySnapshot = {
    messages: fallbackMessages,
  };

  const storedSnapshot = await getStoredJson<ChatHistorySnapshot | null>(
    CHAT_HISTORY_STORAGE_KEY,
    fallbackSnapshot,
  );

  if (!isChatHistorySnapshot(storedSnapshot) || storedSnapshot.messages.length === 0) {
    return fallbackMessages;
  }

  return storedSnapshot.messages.map(normalizeStoredMessage);
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<boolean> {
  return setStoredJson<ChatHistorySnapshot>(CHAT_HISTORY_STORAGE_KEY, {
    messages,
  });
}

export async function clearChatHistoryStorage(): Promise<boolean> {
  return removeStoredItem(CHAT_HISTORY_STORAGE_KEY);
}
