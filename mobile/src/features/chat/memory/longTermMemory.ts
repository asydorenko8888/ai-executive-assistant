import type { LongTermMemory, MemoryCandidate } from '@/src/features/chat/memory/types';
import { normalizeMemoryText, scoreMemoryCandidate, tokenizeMemoryText } from '@/src/features/chat/memory/memoryScoring';
import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const LONG_TERM_MEMORY_STORAGE_KEY = 'executive-ai.long-term-memory.v1';
const LONG_TERM_MEMORY_LIMIT = 80;

type LongTermMemorySnapshot = {
  memories: LongTermMemory[];
};

function isLongTermMemory(value: unknown): value is LongTermMemory {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LongTermMemory>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.details === 'string' &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.keywords) &&
    typeof candidate.importance === 'number' &&
    typeof candidate.confidence === 'number' &&
    typeof candidate.sourceCount === 'number' &&
    Array.isArray(candidate.sourceMessageIds) &&
    typeof candidate.firstCapturedAt === 'string' &&
    typeof candidate.lastUpdatedAt === 'string'
  );
}

function isLongTermMemorySnapshot(value: unknown): value is LongTermMemorySnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LongTermMemorySnapshot>;

  return Array.isArray(candidate.memories) && candidate.memories.every(isLongTermMemory);
}

function createMemoryId(category: LongTermMemory['category'], summary: string) {
  return `${category}-${normalizeMemoryText(summary).replace(/\s+/g, '-').slice(0, 80)}`;
}

function estimateCandidateSimilarity(candidate: MemoryCandidate, memory: LongTermMemory) {
  if (candidate.category !== memory.category) {
    return 0;
  }

  const candidateTokens = new Set([...candidate.keywords, ...tokenizeMemoryText(candidate.summary)]);
  const memoryTokens = new Set([...memory.keywords, ...tokenizeMemoryText(memory.summary)]);

  let overlapCount = 0;

  candidateTokens.forEach((token) => {
    if (memoryTokens.has(token)) {
      overlapCount += 1;
    }
  });

  const unionSize = new Set([...candidateTokens, ...memoryTokens]).size;
  const overlapRatio = unionSize === 0 ? 0 : overlapCount / unionSize;
  const summaryMatch = normalizeMemoryText(candidate.summary) === normalizeMemoryText(memory.summary) ? 0.32 : 0;

  return overlapRatio + summaryMatch;
}

function mergeMemoryCandidate(memory: LongTermMemory, candidate: MemoryCandidate) {
  const candidateScore = scoreMemoryCandidate(candidate, [memory]);

  return {
    ...memory,
    details: candidate.details.length > memory.details.length ? candidate.details : memory.details,
    tags: Array.from(new Set([...memory.tags, ...candidate.tags])).slice(0, 10),
    keywords: Array.from(new Set([...memory.keywords, ...candidate.keywords])).slice(0, 16),
    importance: Math.max(memory.importance, candidateScore),
    confidence: Math.max(memory.confidence, candidate.directness),
    sourceCount: memory.sourceCount + 1,
    sourceMessageIds: Array.from(new Set([...memory.sourceMessageIds, candidate.sourceMessageId])).slice(-12),
    lastUpdatedAt: candidate.capturedAt,
  } satisfies LongTermMemory;
}

function sortMemories(memories: LongTermMemory[]) {
  return [...memories].sort((left, right) => {
    const importanceDelta = right.importance - left.importance;

    if (importanceDelta !== 0) {
      return importanceDelta;
    }

    return Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt);
  });
}

export async function loadLongTermMemories() {
  const snapshot = await getStoredJson<LongTermMemorySnapshot | null>(LONG_TERM_MEMORY_STORAGE_KEY, {
    memories: [],
  });

  if (!isLongTermMemorySnapshot(snapshot)) {
    return [] as LongTermMemory[];
  }

  return sortMemories(snapshot.memories);
}

export async function saveLongTermMemories(memories: LongTermMemory[]) {
  return setStoredJson<LongTermMemorySnapshot>(LONG_TERM_MEMORY_STORAGE_KEY, {
    memories: sortMemories(memories).slice(0, LONG_TERM_MEMORY_LIMIT),
  });
}

export async function upsertLongTermMemories(candidates: MemoryCandidate[]) {
  if (candidates.length === 0) {
    return loadLongTermMemories();
  }

  const existingMemories = await loadLongTermMemories();
  const updatedMemories = [...existingMemories];

  candidates.forEach((candidate) => {
    const existingMemoryIndex = updatedMemories.findIndex(
      (memory) => estimateCandidateSimilarity(candidate, memory) >= 0.52,
    );

    if (existingMemoryIndex >= 0) {
      updatedMemories[existingMemoryIndex] = mergeMemoryCandidate(updatedMemories[existingMemoryIndex], candidate);
      return;
    }

    const importance = scoreMemoryCandidate(candidate, existingMemories);

    updatedMemories.push({
      id: createMemoryId(candidate.category, candidate.summary),
      category: candidate.category,
      summary: candidate.summary,
      details: candidate.details,
      tags: Array.from(new Set(candidate.tags)).slice(0, 10),
      keywords: Array.from(new Set(candidate.keywords)).slice(0, 16),
      importance,
      confidence: candidate.directness,
      sourceCount: 1,
      sourceMessageIds: [candidate.sourceMessageId],
      firstCapturedAt: candidate.capturedAt,
      lastUpdatedAt: candidate.capturedAt,
    });
  });

  await saveLongTermMemories(updatedMemories);
  return sortMemories(updatedMemories);
}

export async function markMemoriesAsRetrieved(memoriesToMark: LongTermMemory[]) {
  if (memoriesToMark.length === 0) {
    return;
  }

  const currentMemories = await loadLongTermMemories();
  const memoryIdsToMark = new Set(memoriesToMark.map((memory) => memory.id));
  const retrievalTimestamp = new Date().toISOString();

  await saveLongTermMemories(
    currentMemories.map((memory) =>
      memoryIdsToMark.has(memory.id)
        ? {
            ...memory,
            lastRetrievedAt: retrievalTimestamp,
          }
        : memory,
    ),
  );
}
