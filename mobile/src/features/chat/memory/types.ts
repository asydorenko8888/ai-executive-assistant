import type { ChatMessage } from '@/src/entities/chat/types';

export type MemoryCategory =
  | 'preference'
  | 'life_event'
  | 'relationship'
  | 'recurring_goal'
  | 'habit'
  | 'fear'
  | 'project'
  | 'routine'
  | 'communication_style'
  | 'situation';

export type LongTermMemory = {
  id: string;
  category: MemoryCategory;
  summary: string;
  details: string;
  tags: string[];
  keywords: string[];
  importance: number;
  confidence: number;
  sourceCount: number;
  sourceMessageIds: string[];
  firstCapturedAt: string;
  lastUpdatedAt: string;
  lastRetrievedAt?: string;
};

export type MemoryCandidate = {
  category: MemoryCategory;
  summary: string;
  details: string;
  tags: string[];
  keywords: string[];
  directness: number;
  emotionalWeight: number;
  salience: number;
  sourceMessageId: string;
  sourceSnippet: string;
  capturedAt: string;
};

export type RankedMemory = {
  memory: LongTermMemory;
  score: number;
};

export type ShortTermMemory = {
  currentTopics: string[];
  activeSituations: string[];
  temporaryTasks: string[];
  recentEmotionalState?: string;
  sourceMessageIds: string[];
  generatedAt: string;
};

export type MemoryPromptContext = {
  systemMessages: ChatMessage[];
  shortTermMemory: ShortTermMemory;
  relevantLongTermMemories: LongTermMemory[];
};
