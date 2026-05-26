export type ChatRole = 'system' | 'assistant' | 'user' | 'tool';

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status: ChatMessageStatus;
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage?: ChatMessage;
};

export type ChatTypingState = {
  isActive: boolean;
  label: string;
};
