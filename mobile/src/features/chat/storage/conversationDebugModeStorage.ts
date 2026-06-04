import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const CONVERSATION_DEBUG_MODE_KEY = 'executive-ai.conversation-debug-mode.v1';

export type ConversationDebugModePreference = {
  enabled: boolean;
};

export async function loadConversationDebugModeEnabled(): Promise<boolean> {
  const stored = await getStoredJson<ConversationDebugModePreference | null>(
    CONVERSATION_DEBUG_MODE_KEY,
    null,
  );

  return stored?.enabled ?? false;
}

export async function saveConversationDebugModeEnabled(enabled: boolean) {
  return setStoredJson<ConversationDebugModePreference>(CONVERSATION_DEBUG_MODE_KEY, { enabled });
}
