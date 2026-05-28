import type { ChatMessage } from '@/src/entities/chat/types';
import {
  appendVoiceSessionAssistantMessage,
  appendVoiceSessionUserMessage,
  createVoiceSessionMemory,
  maybeCompressVoiceSession,
  type VoiceSessionMemory,
} from '@/src/features/voice/memory/voiceSessionMemory';
import { getConversationPayloadMessages } from '@/src/features/chat/store/executiveConversationStore';

export function buildVoiceSessionMemoryFromMessages(messages: ChatMessage[]): VoiceSessionMemory {
  const conversationMessages = getConversationPayloadMessages(messages);

  let memory = createVoiceSessionMemory();

  for (const message of conversationMessages) {
    if (message.role === 'user') {
      memory = appendVoiceSessionUserMessage(memory, message);
      continue;
    }

    if (message.role === 'assistant' && message.content.trim()) {
      memory = appendVoiceSessionAssistantMessage(memory, message);
    }
  }

  return maybeCompressVoiceSession(memory);
}
