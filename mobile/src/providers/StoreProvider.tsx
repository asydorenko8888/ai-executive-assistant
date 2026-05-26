import { useRef, type PropsWithChildren } from 'react';

import { AssistantStoreContext, createAssistantStore } from '@/src/store/assistantStore';

export function StoreProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<ReturnType<typeof createAssistantStore> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createAssistantStore();
  }

  return (
    <AssistantStoreContext.Provider value={storeRef.current}>
      {children}
    </AssistantStoreContext.Provider>
  );
}
