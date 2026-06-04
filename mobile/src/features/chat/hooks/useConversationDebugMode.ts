import { useEffect } from 'react';

import { useConversationDebugModeStore } from '@/src/features/chat/store/conversationDebugModeStore';

export function useConversationDebugMode() {
  const enabled = useConversationDebugModeStore((state) => state.enabled);
  const isHydrated = useConversationDebugModeStore((state) => state.isHydrated);
  const hydrate = useConversationDebugModeStore((state) => state.hydrate);
  const setEnabled = useConversationDebugModeStore((state) => state.setEnabled);
  const toggle = useConversationDebugModeStore((state) => state.toggle);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    enabled,
    isHydrated,
    setEnabled,
    toggle,
  };
}
