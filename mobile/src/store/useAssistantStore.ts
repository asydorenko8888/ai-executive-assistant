import { useContext } from 'react';

import { useStore } from 'zustand';

import { AssistantStoreContext, type AssistantStoreState } from '@/src/store/assistantStore';

export function useAssistantStore<T>(selector: (state: AssistantStoreState) => T) {
  const store = useContext(AssistantStoreContext);

  if (!store) {
    throw new Error('useAssistantStore must be used within StoreProvider');
  }

  return useStore(store, selector);
}
