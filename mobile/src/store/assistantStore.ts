import { createContext } from 'react';

import { createStore } from 'zustand/vanilla';

import { getHomeDashboardContent } from '@/src/services/home/homeContent';
import type { ExecutiveProfile, HomeDashboardData } from '@/src/entities/home/types';

export type AssistantStoreState = {
  profile: ExecutiveProfile;
  homeDashboard: HomeDashboardData;
  setProfile: (profile: ExecutiveProfile) => void;
  setHomeDashboard: (homeDashboard: HomeDashboardData) => void;
};

export type AssistantStoreApi = ReturnType<typeof createAssistantStore>;

export const AssistantStoreContext = createContext<AssistantStoreApi | null>(null);

export function createAssistantStore() {
  const initialState = getHomeDashboardContent();

  return createStore<AssistantStoreState>((set) => ({
    profile: initialState.profile,
    homeDashboard: initialState.dashboard,
    setProfile: (profile) => set({ profile }),
    setHomeDashboard: (homeDashboard) => set({ homeDashboard }),
  }));
}
