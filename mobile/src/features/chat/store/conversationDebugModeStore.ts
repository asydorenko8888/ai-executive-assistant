import { create } from 'zustand';

import {
  loadConversationDebugModeEnabled,
  saveConversationDebugModeEnabled,
} from '@/src/features/chat/storage/conversationDebugModeStorage';

type ConversationDebugModeState = {
  enabled: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  toggle: () => Promise<void>;
};

let hydratePromise: Promise<void> | null = null;

export const useConversationDebugModeStore = create<ConversationDebugModeState>((set, get) => ({
  enabled: false,
  isHydrated: false,

  hydrate: async () => {
    if (get().isHydrated) {
      return;
    }

    if (!hydratePromise) {
      hydratePromise = (async () => {
        const enabled = await loadConversationDebugModeEnabled();
        set({ enabled, isHydrated: true });
      })();
    }

    await hydratePromise;
  },

  setEnabled: async (enabled) => {
    set({ enabled });
    await saveConversationDebugModeEnabled(enabled);
  },

  toggle: async () => {
    const next = !get().enabled;
    await get().setEnabled(next);
  },
}));
