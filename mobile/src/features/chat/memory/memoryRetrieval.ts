import type { ChatMessage } from '@/src/entities/chat/types';
import { buildShortTermMemory, buildShortTermMemoryPrompt } from '@/src/features/chat/memory/shortTermMemory';
import { loadLongTermMemories, markMemoriesAsRetrieved } from '@/src/features/chat/memory/longTermMemory';
import { scoreMemoryRelevance } from '@/src/features/chat/memory/memoryScoring';
import type { LongTermMemory, MemoryPromptContext, RankedMemory } from '@/src/features/chat/memory/types';

function buildLongTermMemoryPrompt(memories: LongTermMemory[]) {
  if (memories.length === 0) {
    return null;
  }

  const memorySummary = memories.map((memory) => memory.summary).join(' ');

  return `Background that may matter if relevant: ${memorySummary}. Use this subtly. Do not recite stored facts or make the memory feel explicit unless the user directly leans on it.`;
}

function rankRelevantLongTermMemories({
  memories,
  query,
  currentTopics,
  activeSituations,
}: {
  memories: LongTermMemory[];
  query: string;
  currentTopics: string[];
  activeSituations: string[];
}) {
  const rankedMemories: RankedMemory[] = memories
    .map((memory) => ({
      memory,
      score: scoreMemoryRelevance({
        memory,
        query,
        currentTopics,
        activeSituations,
      }),
    }))
    .filter((item) => item.score >= 0.34)
    .sort((left, right) => right.score - left.score);

  return rankedMemories.slice(0, 3);
}

function buildSystemMemoryMessages(shortTermPrompt: string | null, longTermPrompt: string | null): ChatMessage[] {
  const createdAt = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return [shortTermPrompt, longTermPrompt]
    .filter((value): value is string => Boolean(value))
    .map((content, index) => ({
      id: `memory-system-${index}-${Date.now()}`,
      role: 'system' as const,
      content,
      createdAt,
      status: 'read' as const,
    }));
}

export async function prepareMemoryPromptContext(messages: ChatMessage[]): Promise<MemoryPromptContext> {
  const shortTermMemory = buildShortTermMemory(messages);
  const longTermMemories = await loadLongTermMemories();
  const latestUserMessages = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join(' ');

  const rankedMemories = rankRelevantLongTermMemories({
    memories: longTermMemories,
    query: latestUserMessages,
    currentTopics: shortTermMemory.currentTopics,
    activeSituations: shortTermMemory.activeSituations,
  });

  const relevantLongTermMemories = rankedMemories.map((item) => item.memory);
  const shortTermPrompt = buildShortTermMemoryPrompt(shortTermMemory);
  const longTermPrompt = buildLongTermMemoryPrompt(relevantLongTermMemories);

  if (relevantLongTermMemories.length > 0) {
    void markMemoriesAsRetrieved(relevantLongTermMemories);
  }

  return {
    systemMessages: buildSystemMemoryMessages(shortTermPrompt, longTermPrompt),
    shortTermMemory,
    relevantLongTermMemories,
  };
}
