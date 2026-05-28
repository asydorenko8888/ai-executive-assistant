import { useEffect } from 'react';

import { useExecutiveConversationStore } from '@/src/features/chat/store/executiveConversationStore';

export function useHydrateExecutiveConversation() {
  const isHydrated = useExecutiveConversationStore((state) => state.isHydrated);

  useEffect(() => {
    void useExecutiveConversationStore.getState().hydrate();
  }, []);

  return isHydrated;
}
