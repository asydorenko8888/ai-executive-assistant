import type { LongTermMemory } from '@/src/features/chat/memory/types';
import type { ExecutiveUserPreferences, ResolvedExecutiveUserPreferences } from '@/src/features/agent/types';
import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const EXECUTIVE_USER_PREFERENCES_STORAGE_KEY = 'executive-ai.user-preferences.v1';

export const defaultExecutiveUserPreferences: ExecutiveUserPreferences = {
  morningBriefingTime: '07:30',
  defaultReminderLeadMinutes: 15,
  preferredTravelMode: 'driving',
  prefersConciseBriefings: true,
  briefingFocus: ['calendar', 'tasks', 'email', 'travel'],
  workingStyleNotes: [],
};

function isExecutiveUserPreferences(value: unknown): value is ExecutiveUserPreferences {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExecutiveUserPreferences>;

  return (
    typeof candidate.morningBriefingTime === 'string' &&
    typeof candidate.defaultReminderLeadMinutes === 'number' &&
    typeof candidate.preferredTravelMode === 'string' &&
    typeof candidate.prefersConciseBriefings === 'boolean' &&
    Array.isArray(candidate.briefingFocus) &&
    Array.isArray(candidate.workingStyleNotes)
  );
}

function inferCommunicationStyle(memories: LongTermMemory[]) {
  return memories.find((memory) => memory.category === 'communication_style')?.summary;
}

function inferWorkPattern(memories: LongTermMemory[]) {
  const routineMemory = memories.find((memory) => memory.tags.includes('late_night_work'));

  if (routineMemory) {
    return 'late-night';
  }

  return memories.find((memory) => memory.category === 'routine' || memory.category === 'habit')?.summary;
}

function inferActiveProjects(memories: LongTermMemory[]) {
  return memories
    .filter((memory) => memory.category === 'project')
    .map((memory) => memory.summary)
    .slice(0, 4);
}

function inferImportantPeople(memories: LongTermMemory[]) {
  return memories
    .filter((memory) => memory.category === 'relationship')
    .map((memory) => memory.summary)
    .slice(0, 4);
}

export async function loadExecutiveUserPreferences() {
  const storedPreferences = await getStoredJson<ExecutiveUserPreferences | null>(
    EXECUTIVE_USER_PREFERENCES_STORAGE_KEY,
    defaultExecutiveUserPreferences,
  );

  if (!isExecutiveUserPreferences(storedPreferences)) {
    return defaultExecutiveUserPreferences;
  }

  return {
    ...defaultExecutiveUserPreferences,
    ...storedPreferences,
  };
}

export async function saveExecutiveUserPreferences(preferences: ExecutiveUserPreferences) {
  return setStoredJson<ExecutiveUserPreferences>(EXECUTIVE_USER_PREFERENCES_STORAGE_KEY, preferences);
}

export async function patchExecutiveUserPreferences(
  patch: Partial<ExecutiveUserPreferences>,
) {
  const currentPreferences = await loadExecutiveUserPreferences();
  const nextPreferences = {
    ...currentPreferences,
    ...patch,
  };

  await saveExecutiveUserPreferences(nextPreferences);
  return nextPreferences;
}

export async function loadResolvedExecutiveUserPreferences(memories: LongTermMemory[]) {
  const storedPreferences = await loadExecutiveUserPreferences();

  return {
    ...storedPreferences,
    derivedCommunicationStyle: inferCommunicationStyle(memories),
    derivedWorkPattern: inferWorkPattern(memories),
    activeProjects: inferActiveProjects(memories),
    importantPeople: inferImportantPeople(memories),
  } satisfies ResolvedExecutiveUserPreferences;
}
