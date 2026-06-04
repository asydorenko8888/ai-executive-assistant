import { create } from 'zustand';

import type { ChatMessageDebugMeta } from '@/src/features/chat/debug/conversationDebugTypes';

type ConversationMessageDebugState = {
  byMessageId: Record<string, ChatMessageDebugMeta>;
  setForMessage: (messageId: string, meta: ChatMessageDebugMeta) => void;
  getForMessage: (messageId: string) => ChatMessageDebugMeta | undefined;
  clear: () => void;
};

export const useConversationMessageDebugStore = create<ConversationMessageDebugState>((set, get) => ({
  byMessageId: {},

  setForMessage: (messageId, meta) => {
    set((state) => ({
      byMessageId: {
        ...state.byMessageId,
        [messageId]: meta,
      },
    }));
  },

  getForMessage: (messageId) => get().byMessageId[messageId],

  clear: () => {
    set({ byMessageId: {} });
  },
}));
