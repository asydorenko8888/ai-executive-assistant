import { useEffect } from 'react';

import { useExecutiveConversationStore } from '@/src/features/chat/store/executiveConversationStore';

export function useHydrateExecutiveConversation() {
  const hydrate = useExecutiveConversationStore((state) => state.hydrate);
  const isHydrated = useExecutiveConversationStore((state) => state.isHydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return isHydrated;
}
