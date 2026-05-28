import type { ChatMessage } from '@/src/entities/chat/types';
import type { ShortTermMemory } from '@/src/features/chat/memory/types';
import { extractSemanticConcepts, normalizeMemoryText, tokenizeMemoryText } from '@/src/features/chat/memory/memoryScoring';

const emotionalSignals: { label: string; keywords: string[] }[] = [
  { label: 'overloaded', keywords: ['overloaded', 'exhausted', 'burnout', 'burned out', 'перегруз', 'виснажен', 'вигоран', 'выгор'] },
  { label: 'anxious', keywords: ['afraid', 'scared', 'worried', 'anxious', 'нерв', 'тривог', 'боюся', 'боюсь', 'страшно'] },
  { label: 'sad', keywords: ['grief', 'lonely', 'empty', 'самот', 'пуст', 'одинок', 'тяжело'] },
  { label: 'frustrated', keywords: ['frustrated', 'stuck', 'angry', 'annoyed', 'злюсь', 'застряг', 'дратує', 'бесит'] },
];

const taskPatterns = [
  /\b(?:need to|have to|must|trying to)\s+([^.!?\n]+)/i,
  /\b(?:потрібно|треба|маю|хочу)\s+([^.!?\n]+)/i,
  /\b(?:нужно|надо|должен|хочу)\s+([^.!?\n]+)/i,
];

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 5);
}

function humanizeConceptTag(concept: string) {
  return concept.replace(/_/g, ' ');
}

function detectRecentEmotionalState(messages: ChatMessage[]) {
  const latestUserText = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => normalizeMemoryText(message.content))
    .join(' ');

  return emotionalSignals.find((signal) =>
    signal.keywords.some((keyword) => latestUserText.includes(normalizeMemoryText(keyword))),
  )?.label;
}

function extractTemporaryTasks(messages: ChatMessage[]) {
  const tasks: string[] = [];

  messages
    .filter((message) => message.role === 'user')
    .slice(-6)
    .forEach((message) => {
      taskPatterns.forEach((pattern) => {
        const match = message.content.match(pattern);

        if (match?.[1]) {
          tasks.push(match[1].trim());
        }
      });
    });

  return uniqueSorted(tasks);
}

function extractTopics(messages: ChatMessage[]) {
  const recentUserMessages = messages.filter((message) => message.role === 'user').slice(-8);
  const topicFrequency = new Map<string, number>();

  recentUserMessages.forEach((message) => {
    const concepts = extractSemanticConcepts(message.content);
    const lexicalTopics = tokenizeMemoryText(message.content).slice(0, 6);

    [...concepts.map(humanizeConceptTag), ...lexicalTopics].forEach((topic) => {
      topicFrequency.set(topic, (topicFrequency.get(topic) ?? 0) + 1);
    });
  });

  return Array.from(topicFrequency.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([topic]) => topic)
    .slice(0, 5);
}

function extractActiveSituations(messages: ChatMessage[]) {
  const situationTags = new Set<string>();

  messages
    .filter((message) => message.role === 'user')
    .slice(-8)
    .forEach((message) => {
      extractSemanticConcepts(message.content).forEach((concept) => {
        if (concept === 'burnout' || concept === 'immigration' || concept === 'project_building' || concept === 'anxiety') {
          situationTags.add(humanizeConceptTag(concept));
        }
      });
    });

  return Array.from(situationTags).slice(0, 4);
}

export function buildShortTermMemory(messages: ChatMessage[]): ShortTermMemory {
  const recentUserMessages = messages.filter((message) => message.role === 'user').slice(-8);

  return {
    currentTopics: extractTopics(messages),
    activeSituations: extractActiveSituations(messages),
    temporaryTasks: extractTemporaryTasks(messages),
    recentEmotionalState: detectRecentEmotionalState(messages),
    sourceMessageIds: recentUserMessages.map((message) => message.id),
    generatedAt: new Date().toISOString(),
  };
}

export function buildShortTermMemoryPrompt(shortTermMemory: ShortTermMemory) {
  const segments: string[] = [];

  if (shortTermMemory.recentEmotionalState) {
    segments.push(`The user's recent tone reads as ${shortTermMemory.recentEmotionalState}.`);
  }

  if (shortTermMemory.activeSituations.length > 0) {
    segments.push(`Active situations in the background: ${shortTermMemory.activeSituations.join(', ')}.`);
  }

  if (shortTermMemory.temporaryTasks.length > 0) {
    segments.push(`Temporary threads that may still matter: ${shortTermMemory.temporaryTasks.join('; ')}.`);
  }

  if (shortTermMemory.currentTopics.length > 0) {
    segments.push(`Current topics around this conversation: ${shortTermMemory.currentTopics.join(', ')}.`);
  }

  if (segments.length === 0) {
    return null;
  }

  return `Current context that may matter: ${segments.join(' ')} Use it only when it genuinely helps. Keep continuity subtle.`;
}
