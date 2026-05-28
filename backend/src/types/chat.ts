export type BackendChatRole = 'system' | 'assistant' | 'user';

export type BackendChatMessage = {
  role: BackendChatRole;
  content: string;
};
